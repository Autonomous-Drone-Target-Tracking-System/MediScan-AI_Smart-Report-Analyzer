"""
routes/chat.py — Upgraded, HIPAA-compliant Chat API endpoints.

Enforces:
  1. require_hipaa_consent dependency.
  2. Owner-validation of the report being queried (prevent cross-report information leaks).
  3. Records audit log events for all RAG chat sessions.
"""

from __future__ import annotations

import logging
from typing import List
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from db.crud import get_report_by_id, get_biomarkers_by_report_id
from services.chat_service import (
    stream_chat_response,
    get_chat_response,
    get_chat_service_status,
)
from services.security_deps import require_hipaa_consent
from services.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request / Response models ──────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role:    str  = Field(..., pattern="^(user|assistant)$")
    content: str  = Field(..., min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    question:    str              = Field(..., min_length=1, max_length=2000)
    history:     List[ChatMessage] = Field(default_factory=list, max_length=20)
    patient_info: dict            = Field(default_factory=dict)


class ChatResponse(BaseModel):
    answer:    str
    report_id: int


# ── Secure Helper ─────────────────────────────────────────────────────────────

def _load_secure_report_context(report_id: int, current_user: dict):
    """
    Fetch report + biomarkers from DB.
    Verifies owner access or clinician privileges (RBAC).
    """
    user_id = current_user["user_id"]
    role = current_user["role"]

    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found.")

    # Authorization Check
    if report["user_id"] != user_id and role not in ("doctor", "admin"):
        log_audit(
            action="ACCESS_DENIED",
            user_id=user_id,
            resource_id=str(report_id),
            status="UNAUTHORIZED",
            details="User tried to chat with an unauthorized patient report."
        )
        raise HTTPException(
            status_code=403,
            detail="RBAC Enforcement: You are not authorized to consult this report."
        )

    biomarkers = get_biomarkers_by_report_id(report_id)
    if not biomarkers:
        raise HTTPException(
            status_code=404,
            detail=(
                "No analysis results found for this report. "
                "Please run /api/analyze/{report_id} first."
            ),
        )
    return report, biomarkers


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/chat/{report_id}/stream")
async def chat_stream(
    report_id: int,
    body: ChatRequest,
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    Streams a secure, report-aware chat session as SSE chunks.
    Requires HIPAA Consent and verifies document ownership.
    """
    user_id = current_user["user_id"]
    ip = request.client.host if request.client else "127.0.0.1"

    report, biomarkers = _load_secure_report_context(report_id, current_user)
    history_dicts = [m.model_dump() for m in body.history]

    # Log auditable event
    log_audit(
        action="CHAT_WITH_PHI",
        user_id=user_id,
        ip_address=ip,
        resource_id=str(report_id),
        status="SUCCESS",
        details=f"Initiated secure literature-aware chat dialogue. Question length: {len(body.question)} chars."
    )

    async def event_generator():
        async for sse_line in stream_chat_response(
            question     = body.question,
            report       = report,
            biomarkers   = biomarkers,
            history      = history_dicts,
            patient_info = body.patient_info or None,
        ):
            yield sse_line

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.post("/chat/{report_id}", response_model=ChatResponse)
async def chat_once(
    report_id: int,
    body: ChatRequest,
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """Secure, single-turn RAG chat API."""
    user_id = current_user["user_id"]
    ip = request.client.host if request.client else "127.0.0.1"

    report, biomarkers = _load_secure_report_context(report_id, current_user)
    history_dicts = [m.model_dump() for m in body.history]

    log_audit(
        action="CHAT_WITH_PHI",
        user_id=user_id,
        ip_address=ip,
        resource_id=str(report_id),
        status="SUCCESS",
        details="Initiated secure single-turn chat dialogue."
    )

    answer = await get_chat_response(
        question     = body.question,
        report       = report,
        biomarkers   = biomarkers,
        history      = history_dicts,
        patient_info = body.patient_info or None,
    )

    return ChatResponse(answer=answer, report_id=report_id)


@router.get("/chat/status")
async def chat_status(current_user: dict = Depends(require_hipaa_consent)):
    """Health-check: returns secure chat config states."""
    return get_chat_service_status()
