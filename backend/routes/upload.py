"""
Upload endpoint: POST /api/upload
Accepts PDF or image, saves to uploads/, creates DB record.
"""

import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from db.crud import insert_report
from models.schemas import UploadResponse

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
}
MAX_FILE_SIZE_MB = 20


@router.post("/upload", response_model=UploadResponse)
async def upload_report(file: UploadFile = File(...)):
    # Content-type validation
    content_type = file.content_type or ""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{content_type}'. Upload a PDF, JPG, or PNG.",
        )

    # Read and size check
    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({size_mb:.1f} MB). Max allowed: {MAX_FILE_SIZE_MB} MB.",
        )

    # Save to uploads/
    ext = ALLOWED_TYPES[content_type]
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    with open(file_path, "wb") as f:
        f.write(contents)

    # Create DB record
    document_url = f"/uploads/{filename}"
    report_id = insert_report(document_url)

    return UploadResponse(
        report_id=report_id,
        document_url=document_url,
        message="File uploaded successfully. Ready for analysis.",
    )
