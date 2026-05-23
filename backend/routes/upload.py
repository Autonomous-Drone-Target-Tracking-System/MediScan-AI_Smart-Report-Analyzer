"""
routes/upload.py — Upgraded, HIPAA-compliant Secure Upload and Decryption pipeline.

Features:
  1. Restricts uploading to authenticated users who have signed HIPAA Consent.
  2. Applies AES Fernet encryption-at-rest to file contents before writing to disk.
  3. Records UPLOAD_PHI transactions in security audit logs.
  4. Provides on-the-fly decryption download streams for authorized users.
"""

from __future__ import annotations

import os
import uuid
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse, JSONResponse
import io

from db.crud import insert_report, get_report_by_id
from models.schemas import UploadResponse
from services.encryption import encrypt_data, decrypt_data
from services.audit import log_audit
from services.security_deps import require_hipaa_consent, enforce_rate_limiting

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
}
MAX_FILE_SIZE_MB = 20


@router.post("/upload", response_model=UploadResponse, dependencies=[Depends(enforce_rate_limiting)])
async def upload_report(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    Upload a medical report. Validates contents, encrypts the file at rest using AES Fernet,
    associates the record with the authenticated user ID, and audits the transaction.
    """
    user_id = current_user["user_id"]
    ip = request.client.host if request.client else "127.0.0.1"

    # Content-type validation
    content_type = file.content_type or ""
    if content_type not in ALLOWED_TYPES:
        log_audit("UPLOAD_FAILED", user_id, ip, status="FAILED", details=f"Unsupported mime-type: {content_type}")
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{content_type}'. Upload a PDF, JPG, or PNG.",
        )

    # Read and size check
    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        log_audit("UPLOAD_FAILED", user_id, ip, status="FAILED", details=f"File too large: {size_mb:.1f} MB")
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({size_mb:.1f} MB). Max allowed: {MAX_FILE_SIZE_MB} MB.",
        )

    # ── Encryption at Rest ──
    try:
        encrypted_contents = encrypt_data(contents)
    except Exception as e:
        logger.error("[Upload SEC] Encryption failure: %s", e)
        raise HTTPException(status_code=500, detail="Data protection pipeline failed.")

    # Save secure file to disk
    ext = ALLOWED_TYPES[content_type]
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    with open(file_path, "wb") as f:
        f.write(encrypted_contents)

    # Create DB record tied to the actual authenticated user
    document_url = f"/uploads/{filename}"
    report_id = insert_report(document_url, user_id=user_id)

    log_audit(
        action="UPLOAD_PHI",
        user_id=user_id,
        ip_address=ip,
        resource_id=str(report_id),
        status="SUCCESS",
        details=f"Securely uploaded and encrypted file {filename} ({size_mb:.2f} MB)"
    )

    return UploadResponse(
        report_id=report_id,
        document_url=document_url,
        message="File uploaded and encrypted successfully. Ready for analysis.",
    )


@router.get("/upload/decrypt/{report_id}")
async def decrypt_and_stream_report(
    report_id: int,
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    On-the-fly decryption download pathway.
    Retrieves the encrypted report from disk, verifies ownership (RBAC/User access),
    decrypts it in memory, and streams it back. Keeps data secure at all times.
    """
    user_id = current_user["user_id"]
    role = current_user["role"]
    ip = request.client.host if request.client else "127.0.0.1"

    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    # Authorization Check: User must own the report OR be a doctor/admin (RBAC)
    if report["user_id"] != user_id and role not in ("doctor", "admin"):
        log_audit(
            action="ACCESS_DENIED",
            user_id=user_id,
            ip_address=ip,
            resource_id=str(report_id),
            status="UNAUTHORIZED",
            details="User tried to access another patient's medical file."
        )
        raise HTTPException(
            status_code=403,
            detail="RBAC Enforcement: You are not authorized to view this patient's report."
        )

    # Load and decrypt file
    doc_url = report["document_url"]
    filename = doc_url.split("/")[-1]
    file_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Physical report file not found on server storage.")

    try:
        with open(file_path, "rb") as f:
            encrypted_data = f.read()
        decrypted_data = decrypt_data(encrypted_data)
    except Exception as e:
        logger.error("[Upload SEC] Decryption failure for report %d: %s", report_id, e)
        raise HTTPException(status_code=500, detail="Failed to decrypt medical data.")

    # Log secure access audit trace (mandatory HIPAA requirement!)
    log_audit(
        action="VIEW_PHI",
        user_id=user_id,
        ip_address=ip,
        resource_id=str(report_id),
        status="SUCCESS",
        details="Authorized decryption and retrieval of PHI document."
    )

    # Return as stream
    # Mime mapping
    mime = "application/pdf"
    if filename.endswith(".jpg") or filename.endswith(".jpeg"):
        mime = "image/jpeg"
    elif filename.endswith(".png"):
        mime = "image/png"

    return StreamingResponse(
        io.BytesIO(decrypted_data),
        media_type=mime,
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )
