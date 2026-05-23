"""
routes/cardiac.py — Upgraded, HIPAA-compliant Secure Cardiac & ECG Report Router.

Enforces:
  1. require_hipaa_consent JWT session verification.
  2. Sandboxed decryption and physical zero-out shredding.
  3. Persistent audit logging.
  4. Clinical ECG parsing & longitudinal heart rate trend generation.
"""

from __future__ import annotations

import os
import json
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends, Request

from db.database import get_connection
from db.crud import (
    get_report_by_id,
    insert_cardiac_findings,
    get_cardiac_findings_by_report_id,
    mark_report_as_cardiac,
    persist_analysis_metadata,
)
from services.ocr_router import extract_text
from services.cardiac_nlp import parse_cardiac_report
from services.security_deps import require_hipaa_consent
from services.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")


# ── Response Schema Models ────────────────────────────────────────────────────

class CardiacFindingOut(BaseModel):
    parameter_name: str
    extracted_value: str
    abnormality_type: str
    severity: str
    confidence_score: float
    umls_cui: str
    is_emergency: bool


class CardiacAnalysisResult(BaseModel):
    report_id: int
    report_type: str
    heart_rate: Optional[int]
    overall_health_score: int
    clinical_impression: str
    findings: List[CardiacFindingOut]
    recommendations: List[str]
    is_emergency: bool
    patient_info: Dict[str, str]


class HeartRateTrendPoint(BaseModel):
    report_id: int
    upload_timestamp: str
    heart_rate: int
    overall_health_score: int


class CardiacTrendsResponse(BaseModel):
    trends: List[HeartRateTrendPoint]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/cardiac/analyze/{report_id}", response_model=CardiacAnalysisResult)
async def analyze_cardiac_report(
    report_id: int,
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    HIPAA-Secure ECG/Cardiac Analysis Sandbox:
    Decrypts the file, extracts textual waveforms via OCR, parses cardiology anomalies,
    and zero-wipes decrypted storage blocks immediately.
    """
    user_id = current_user["user_id"]
    role = current_user["role"]
    ip = request.client.host if request.client else "127.0.0.1"

    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Cardiac report {report_id} not found.")

    # Authorization Check (RBAC)
    if report["user_id"] != user_id and role not in ("doctor", "admin"):
        log_audit(
            action="ACCESS_DENIED",
            user_id=user_id,
            ip_address=ip,
            resource_id=str(report_id),
            status="UNAUTHORIZED",
            details="RBAC: Unauthorized cardiac analyze attempt."
        )
        raise HTTPException(status_code=403, detail="RBAC: Unauthorized to analyze this report.")

    filename = os.path.basename(report["document_url"])
    file_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Uploaded cardiac file not found on storage.")

    # ── Sandbox Decryption Flow ──
    from services.encryption import decrypt_data
    temp_file_path = os.path.join(UPLOAD_DIR, f"temp_sandbox_card_{report_id}_{filename}")

    try:
        # Load and decrypt
        with open(file_path, "rb") as f:
            encrypted_data = f.read()
        decrypted_data = decrypt_data(encrypted_data)

        # Write sandboxed decrypted file
        with open(temp_file_path, "wb") as f:
            f.write(decrypted_data)

        logger.info("[Cardiac NLP SEC] Commencing OCR extraction for cardiac file %d", report_id)
        raw_text = extract_text(temp_file_path)
        logger.info("[Cardiac NLP SEC] Waveform text retrieved (%d chars). Parsing findings...", len(raw_text))

        # Run advanced hybrid cardiac NLP parser
        nlp_result = await parse_cardiac_report(raw_text)

    except Exception as e:
        logger.error("[Cardiac NLP SEC] Sandbox parsing failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Cardiac parsing sandbox failed: {str(e)}")

    finally:
        # Secure Shredding: Zero-out contents before deletion to prevent recovery
        if os.path.exists(temp_file_path):
            try:
                size = os.path.getsize(temp_file_path)
                with open(temp_file_path, "wb") as f:
                    f.write(b'\x00' * size)
                os.remove(temp_file_path)
                logger.info("[Cardiac NLP SEC] Securely shredded decrypted cardiac sandbox temp files.")
            except Exception as se:
                logger.error("[Cardiac NLP SEC] Sandboxed file shredding failed: %s", se)

    # ── Database Persistence ──
    try:
        # Clear existing findings to support re-analysis
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM cardiac_findings WHERE report_id = ?", (report_id,))
        conn.commit()
        conn.close()

        # Persist findings, impression, and recommendations
        insert_cardiac_findings(report_id, [f.dict() for f in nlp_result.findings])
        persist_analysis_metadata(report_id, nlp_result.clinical_impression, nlp_result.recommendations)
        mark_report_as_cardiac(report_id, nlp_result.report_type, nlp_result.heart_rate)

        # Calculate a cardiac score
        if nlp_result.is_emergency:
            score = 25
        elif any(f.severity in ("Critical", "Moderate") for f in nlp_result.findings):
            score = 65
        else:
            score = 96

        from db.crud import update_health_score
        update_health_score(report_id, score)

    except Exception as dbe:
        logger.error("[Cardiac NLP SEC] Failed to persist cardiac findings in database: %s", dbe)
        raise HTTPException(status_code=500, detail="Failed to save cardiac findings in database.")

    log_audit(
        action="ANALYZE_CARDIAC_PHI",
        user_id=user_id,
        ip_address=ip,
        resource_id=str(report_id),
        status="SUCCESS",
        details=f"Analyzed cardiac report. Modality: {nlp_result.report_type}, Emergency Status: {nlp_result.is_emergency}"
    )

    return CardiacAnalysisResult(
        report_id=report_id,
        report_type=nlp_result.report_type,
        heart_rate=nlp_result.heart_rate,
        overall_health_score=score,
        clinical_impression=nlp_result.clinical_impression,
        findings=[CardiacFindingOut(**f.dict()) for f in nlp_result.findings],
        recommendations=nlp_result.recommendations,
        is_emergency=nlp_result.is_emergency,
        patient_info={"name": "Patient", "age": "Unspecified", "gender": "Unspecified"}
    )


@router.get("/cardiac/report/{report_id}", response_model=CardiacAnalysisResult)
async def get_cardiac_report(
    report_id: int,
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    HIPAA-Secure Cardiac Retrieval:
    Retrieves full structured cardiology findings, arrhythmias, and patient insights.
    """
    user_id = current_user["user_id"]
    role = current_user["role"]
    ip = request.client.host if request.client else "127.0.0.1"

    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Cardiac report not found.")

    # Authorization Check (RBAC)
    if report["user_id"] != user_id and role not in ("doctor", "admin"):
        log_audit(
            action="ACCESS_DENIED",
            user_id=user_id,
            ip_address=ip,
            resource_id=str(report_id),
            status="UNAUTHORIZED",
            details="RBAC: Unauthorized cardiac read attempt."
        )
        raise HTTPException(status_code=403, detail="RBAC: Unauthorized to view this cardiac report.")

    findings = get_cardiac_findings_by_report_id(report_id)
    is_emergency = any(bool(f["is_emergency"]) for f in findings)

    # Parse recommendations
    recommendations = []
    if report["recommendations"]:
        try:
            recommendations = json.loads(report["recommendations"])
        except Exception:
            recommendations = [report["recommendations"]]

    log_audit(
        action="VIEW_CARDIAC_PHI",
        user_id=user_id,
        ip_address=ip,
        resource_id=str(report_id),
        status="SUCCESS",
        details=f"Retrieved cardiac report. Findings count: {len(findings)}"
    )

    return CardiacAnalysisResult(
        report_id=report["report_id"],
        report_type=report["report_type"] or "ECG",
        heart_rate=report["heart_rate"],
        overall_health_score=report["overall_health_score"] or 100,
        clinical_impression=report["ai_summary"] or "Cardiac evaluation pending.",
        findings=[
            CardiacFindingOut(
                parameter_name=f["parameter_name"],
                extracted_value=f["extracted_value"],
                abnormality_type=f["abnormality_type"],
                severity=f["severity"],
                confidence_score=f["confidence_score"],
                umls_cui=f["umls_cui"],
                is_emergency=bool(f["is_emergency"])
            ) for f in findings
        ],
        recommendations=recommendations,
        is_emergency=is_emergency,
        patient_info={"name": "Patient", "age": "Unspecified", "gender": "Unspecified"}
    )


@router.get("/cardiac/trends", response_model=CardiacTrendsResponse)
async def get_cardiac_trends(
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    HIPAA-Secure Longitudinal Heart Rate Tracking:
    Gathers heart rate measurements from all parsed cardiac records belonging to the authenticated user.
    """
    user_id = current_user["user_id"]
    ip = request.client.host if request.client else "127.0.0.1"

    try:
        conn = get_connection()
        cur = conn.cursor()
        rows = cur.execute(
            """SELECT report_id, upload_timestamp, heart_rate, overall_health_score
               FROM reports
               WHERE user_id = ? AND is_cardiac = 1 AND heart_rate IS NOT NULL
               ORDER BY upload_timestamp ASC""",
            (user_id,)
        ).fetchall()
        conn.close()

        trends = [
            HeartRateTrendPoint(
                report_id=r["report_id"],
                upload_timestamp=r["upload_timestamp"],
                heart_rate=r["heart_rate"],
                overall_health_score=r["overall_health_score"] or 100
            ) for r in rows
        ]

        log_audit(
            action="LIST_CARDIAC_TRENDS",
            user_id=user_id,
            ip_address=ip,
            status="SUCCESS",
            details=f"Retrieved {len(trends)} historical heart rate milestones for cardiac trends."
        )
        return CardiacTrendsResponse(trends=trends)
    except Exception as e:
        logger.error("[Cardiac NLP SEC] Trends fetch failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load historical heart rate trends.")
