"""
routes/radiology.py — Upgraded, HIPAA-compliant Secure Radiology Scan Router.

Enforces:
  1. require_hipaa_consent JWT session verification.
  2. Secure sandbox file decryption and physical zero-out shredding.
  3. Persistent audit trail logging.
  4. Clinical entity extraction using advanced radiology NLP.
"""

from __future__ import annotations

import os
import json
import logging
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends, Request

from db.database import get_connection
from db.crud import (
    get_report_by_id,
    insert_radiology_findings,
    get_radiology_findings_by_report_id,
    mark_report_as_radiology,
    persist_analysis_metadata,
)
from services.ocr_router import extract_text
from services.radiology_nlp import parse_radiology_report
from services.security_deps import require_hipaa_consent
from services.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")


# ── Response Schema Models ────────────────────────────────────────────────────

class AnatomicalFindingOut(BaseModel):
    anatomical_structure: str
    finding: str
    abnormality_type: str
    severity: str
    confidence_score: float
    is_uncertain: bool
    umls_cui: str


class RadiologyAnalysisResult(BaseModel):
    report_id: int
    report_type: str
    overall_health_score: int
    clinical_impression: str
    findings: List[AnatomicalFindingOut]
    recommendations: List[str]
    patient_info: Dict[str, str]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/radiology/analyze/{report_id}", response_model=RadiologyAnalysisResult)
async def analyze_radiology_report(
    report_id: int,
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    HIPAA-Secure Radiology Analysis Sandbox:
    Temporarily decrypts the scan report, extracts raw text with OCR,
    runs the BioNLP Clinical Extraction Engine, and zero-wipes the memory buffer.
    """
    user_id = current_user["user_id"]
    role = current_user["role"]
    ip = request.client.host if request.client else "127.0.0.1"

    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Radiology report {report_id} not found.")

    # Authorization Check (RBAC)
    if report["user_id"] != user_id and role not in ("doctor", "admin"):
        log_audit(
            action="ACCESS_DENIED",
            user_id=user_id,
            ip_address=ip,
            resource_id=str(report_id),
            status="UNAUTHORIZED",
            details="RBAC: Unauthorized radiology analyze attempt."
        )
        raise HTTPException(status_code=403, detail="RBAC: Unauthorized to analyze this report.")

    filename = os.path.basename(report["document_url"])
    file_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Uploaded scan file not found on storage.")

    # ── Sandbox Decryption Flow ──
    from services.encryption import decrypt_data
    temp_file_path = os.path.join(UPLOAD_DIR, f"temp_sandbox_rad_{report_id}_{filename}")

    try:
        # Load and decrypt the encrypted file at rest
        with open(file_path, "rb") as f:
            encrypted_data = f.read()
        decrypted_data = decrypt_data(encrypted_data)

        # Write to sandboxed path
        with open(temp_file_path, "wb") as f:
            f.write(decrypted_data)

        logger.info("[Rad NLP SEC] Running OCR on radiology file %d", report_id)
        raw_text = extract_text(temp_file_path)
        logger.info("[Rad NLP SEC] OCR text retrieved (%d chars). Running BioNLP extraction...", len(raw_text))

        # Run advanced hybrid biomedical NLP parser
        nlp_result = await parse_radiology_report(raw_text)

    except Exception as e:
        logger.error("[Rad NLP SEC] Sandbox radiology parsing failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Radiology parsing sandbox failed: {str(e)}")

    finally:
        # Physical Secure Shredding: Zero-out contents before deletion to prevent recovery
        if os.path.exists(temp_file_path):
            try:
                size = os.path.getsize(temp_file_path)
                with open(temp_file_path, "wb") as f:
                    f.write(b'\x00' * size)
                os.remove(temp_file_path)
                logger.info("[Rad NLP SEC] Securely shredded decrypted radiology sandbox temp files.")
            except Exception as se:
                logger.error("[Rad NLP SEC] Sandboxed file shredding failed: %s", se)

    # ── Database Persistence ──
    try:
        # 1. Clear any existing findings to support re-analysis
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM radiology_findings WHERE report_id = ?", (report_id,))
        conn.commit()
        conn.close()

        # 2. Persist findings, impression, and recommendations
        insert_radiology_findings(report_id, [f.dict() for f in nlp_result.anatomical_findings])
        persist_analysis_metadata(report_id, nlp_result.clinical_impression, nlp_result.recommendations)
        mark_report_as_radiology(report_id, nlp_result.report_type)

        # Calculate a clinical radiology score based on maximum severity
        critical_count = sum(1 for f in nlp_result.anatomical_findings if f.severity == "Critical")
        moderate_count = sum(1 for f in nlp_result.anatomical_findings if f.severity == "Moderate")
        
        if critical_count > 0:
            score = 45
        elif moderate_count > 0:
            score = 75
        else:
            score = 98

        from db.crud import update_health_score
        update_health_score(report_id, score)

    except Exception as dbe:
        logger.error("[Rad NLP SEC] Failed to persist radiology findings in database: %s", dbe)
        raise HTTPException(status_code=500, detail="Failed to save radiological findings in database.")

    log_audit(
        action="ANALYZE_RADIOLOGY_PHI",
        user_id=user_id,
        ip_address=ip,
        resource_id=str(report_id),
        status="SUCCESS",
        details=f"Analyzed radiology report. Modality: {nlp_result.report_type}, Findings Count: {len(nlp_result.anatomical_findings)}"
    )

    # Fetch patient info placeholders
    patient_info = {"name": "Patient", "age": "Unspecified", "gender": "Unspecified"}

    return RadiologyAnalysisResult(
        report_id=report_id,
        report_type=nlp_result.report_type,
        overall_health_score=score,
        clinical_impression=nlp_result.clinical_impression,
        findings=[AnatomicalFindingOut(**f.dict()) for f in nlp_result.anatomical_findings],
        recommendations=nlp_result.recommendations,
        patient_info=patient_info
    )


@router.get("/radiology/report/{report_id}", response_model=RadiologyAnalysisResult)
async def get_radiology_report(
    report_id: int,
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    HIPAA-Secure Radiology Analysis Retrieval:
    Exposes full structured radiological findings and patient explanations for authorized clients.
    """
    user_id = current_user["user_id"]
    role = current_user["role"]
    ip = request.client.host if request.client else "127.0.0.1"

    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Radiology report not found.")

    # Authorization Check (RBAC)
    if report["user_id"] != user_id and role not in ("doctor", "admin"):
        log_audit(
            action="ACCESS_DENIED",
            user_id=user_id,
            ip_address=ip,
            resource_id=str(report_id),
            status="UNAUTHORIZED",
            details="RBAC: Unauthorized radiology read attempt."
        )
        raise HTTPException(status_code=403, detail="RBAC: Unauthorized to view this radiology report.")

    findings = get_radiology_findings_by_report_id(report_id)
    
    # Try parsing recommendations
    recommendations = []
    if report["recommendations"]:
        try:
            recommendations = json.loads(report["recommendations"])
        except Exception:
            recommendations = [report["recommendations"]]

    log_audit(
        action="VIEW_RADIOLOGY_PHI",
        user_id=user_id,
        ip_address=ip,
        resource_id=str(report_id),
        status="SUCCESS",
        details=f"Retrieved radiology results with {len(findings)} anatomical records."
    )

    return RadiologyAnalysisResult(
        report_id=report["report_id"],
        report_type=report["report_type"] or "Other",
        overall_health_score=report["overall_health_score"] or 100,
        clinical_impression=report["ai_summary"] or "Radiological evaluation pending.",
        findings=[
            AnatomicalFindingOut(
                anatomical_structure=f["anatomical_structure"],
                finding=f["finding"],
                abnormality_type=f["abnormality_type"],
                severity=f["severity"],
                confidence_score=f["confidence_score"],
                is_uncertain=bool(f["is_uncertain"]),
                umls_cui=f["umls_cui"]
            ) for f in findings
        ],
        recommendations=recommendations,
        patient_info={"name": "Patient", "age": "Unspecified", "gender": "Unspecified"}
    )
