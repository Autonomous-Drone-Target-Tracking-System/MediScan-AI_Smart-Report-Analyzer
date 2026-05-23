"""
routes/dicom.py — Upgraded, HIPAA-compliant Secure DICOM & Medical Scan Ingestion Router.

Handles:
  1. require_hipaa_consent JWT session verification.
  2. Temporary sandbox decryption and zero-out physical file shredding.
  3. DICOM and standard image file conversion to base64 web views.
  4. Unified tag extraction and metadata queries.
"""

from __future__ import annotations

import os
import json
import logging
from typing import Dict, Any, List
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends, Request

from db.database import get_connection
from db.crud import (
    get_report_by_id,
    mark_report_as_dicom,
)
from services.dicom_parser import parse_dicom_file, parse_standard_image
from services.security_deps import require_hipaa_consent
from services.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")


# ── Response Schema Models ────────────────────────────────────────────────────

class DICOMMetadataOut(BaseModel):
    modality: str
    patient_name: str
    patient_id: str
    patient_sex: str
    patient_age: str
    study_date: str
    study_description: str
    manufacturer: str
    dimensions: str
    orientation: str
    window_center: int
    window_width: int


class DICOMAnalysisResult(BaseModel):
    report_id: int
    metadata: DICOMMetadataOut
    image_b64: str
    overall_health_score: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/dicom/analyze/{report_id}", response_model=DICOMAnalysisResult)
async def analyze_dicom_scan(
    report_id: int,
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    HIPAA-Secure Medical Image Processing:
    Decrypts the scan, extracts dicom attributes or converts generic frames (PNG/JPG),
    renders a web-ready windowed base64 slice, and shreds decrypted blocks immediately.
    """
    user_id = current_user["user_id"]
    role = current_user["role"]
    ip = request.client.host if request.client else "127.0.0.1"

    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Medical scan report not found.")

    # Authorization Check (RBAC)
    if report["user_id"] != user_id and role not in ("doctor", "admin"):
        log_audit(
            action="ACCESS_DENIED",
            user_id=user_id,
            ip_address=ip,
            resource_id=str(report_id),
            status="UNAUTHORIZED",
            details="RBAC: Unauthorized DICOM scan analyze attempt."
        )
        raise HTTPException(status_code=403, detail="RBAC: Unauthorized to view this scan.")

    filename = os.path.basename(report["document_url"])
    file_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Uploaded scan file not found on storage.")

    # ── Sandbox Decryption Flow ──
    from services.encryption import decrypt_data
    temp_file_path = os.path.join(UPLOAD_DIR, f"temp_sandbox_dicom_{report_id}_{filename}")

    try:
        # Load and decrypt
        with open(file_path, "rb") as f:
            encrypted_data = f.read()
        decrypted_data = decrypt_data(encrypted_data)

        # Write sandboxed decrypted file
        with open(temp_file_path, "wb") as f:
            f.write(decrypted_data)

        logger.info("[DICOM Router] Sandbox ready. Processing file format for %s", filename)

        # Classify and run appropriate parser
        is_dicom_ext = filename.lower().endswith(".dcm")
        
        if is_dicom_ext:
            tags, b64_image = parse_dicom_file(temp_file_path)
        else:
            tags, b64_image = parse_standard_image(temp_file_path)

        if not b64_image:
            raise ValueError("Failed to render a web-viewable slice representing this scan.")

    except Exception as e:
        logger.error("[DICOM Router] Sandbox processing failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Scan parser sandbox error: {str(e)}")

    finally:
        # Secure Shredding: Zero-out contents before deletion to prevent recovery
        if os.path.exists(temp_file_path):
            try:
                size = os.path.getsize(temp_file_path)
                with open(temp_file_path, "wb") as f:
                    f.write(b'\x00' * size)
                os.remove(temp_file_path)
                logger.info("[DICOM Router] Securely shredded decrypted temporary sandbox files.")
            except Exception as se:
                logger.error("[DICOM Router] Sandboxed file shredding failed: %s", se)

    # ── Database Persistence ──
    try:
        payload = {
            "metadata": tags,
            "image_b64": b64_image
        }

        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE reports SET ai_summary = ?, overall_health_score = 100 WHERE report_id = ?",
            (json.dumps(payload), report_id)
        )
        conn.commit()
        conn.close()

        mark_report_as_dicom(report_id, tags["modality"])

    except Exception as dbe:
        logger.error("[DICOM Router] Failed to save parsed tags in database: %s", dbe)
        raise HTTPException(status_code=500, detail="Failed to save parsed telemetry in database.")

    log_audit(
        action="ANALYZE_DICOM_PHI",
        user_id=user_id,
        ip_address=ip,
        resource_id=str(report_id),
        status="SUCCESS",
        details=f"Processed medical scan. Modality: {tags['modality']}, Dimensions: {tags['dimensions']}"
    )

    return DICOMAnalysisResult(
        report_id=report_id,
        metadata=DICOMMetadataOut(**tags),
        image_b64=b64_image,
        overall_health_score=100
    )


@router.get("/dicom/report/{report_id}", response_model=DICOMAnalysisResult)
async def get_dicom_report(
    report_id: int,
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    HIPAA-Secure DICOM Study Retrieval:
    Retrieves full structured metadata tags and the processed base64 visual slice.
    """
    user_id = current_user["user_id"]
    role = current_user["role"]
    ip = request.client.host if request.client else "127.0.0.1"

    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Medical scan not found.")

    # Authorization Check (RBAC)
    if report["user_id"] != user_id and role not in ("doctor", "admin"):
        log_audit(
            action="ACCESS_DENIED",
            user_id=user_id,
            ip_address=ip,
            resource_id=str(report_id),
            status="UNAUTHORIZED",
            details="RBAC: Unauthorized scan read attempt."
        )
        raise HTTPException(status_code=403, detail="RBAC: Unauthorized to view this scan.")

    if not report["ai_summary"]:
        raise HTTPException(status_code=400, detail="Medical scan report not analyzed yet.")

    try:
        payload = json.loads(report["ai_summary"])
        tags = payload["metadata"]
        b64_image = payload["image_b64"]
    except Exception:
        raise HTTPException(status_code=500, detail="Corrupted medical scan data structure in database.")

    log_audit(
        action="VIEW_DICOM_PHI",
        user_id=user_id,
        ip_address=ip,
        resource_id=str(report_id),
        status="SUCCESS",
        details=f"Retrieved scan. Modality: {tags.get('modality')}"
    )

    return DICOMAnalysisResult(
        report_id=report_id,
        metadata=DICOMMetadataOut(**tags),
        image_b64=b64_image,
        overall_health_score=100
    )
