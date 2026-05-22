"""
Unified OCR router: routes to PDF or image extractor based on file extension.
"""

import os


def extract_text(file_path: str) -> str:
    """Detect file type and extract text using the appropriate service."""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        from services.pdf_service import extract_text_from_pdf
        return extract_text_from_pdf(file_path)
    elif ext in (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"):
        from services.ocr_service import extract_text_from_image
        return extract_text_from_image(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")
