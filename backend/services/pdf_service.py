"""
PDF text extraction:
1. Try pdfplumber (fast, text-based PDFs)
2. If empty → send the whole PDF to OCR.space API (handles scanned PDFs natively)
3. Final fallback: per-page image conversion + local Tesseract
"""

import os
import pdfplumber
import tempfile
from pathlib import Path


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from a PDF file."""

    # ── Step 1: pdfplumber (text-based PDFs) ──────────────────────────────────
    text_pages = []
    scanned_pages = []

    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text and text.strip():
                text_pages.append(text)
            else:
                scanned_pages.append(i)

    if text_pages and not scanned_pages:
        # Fully text-based PDF — return directly
        result = "\n".join(text_pages)
        print(f"pdfplumber extracted {len(result)} chars (text-based PDF)")
        return result

    # ── Step 2: OCR.space handles PDF natively (best for scanned PDFs) ────────
    from services.ocr_service import _call_ocrspace
    ocr_text = _call_ocrspace(pdf_path, file_type="pdf")

    if ocr_text.strip():
        # Merge any text-layer content with OCR result
        combined = "\n".join(text_pages) + "\n" + ocr_text
        return combined.strip()

    # ── Step 3: Per-page image fallback (last resort) ─────────────────────────
    print("Falling back to per-page image OCR for PDF...")
    all_text = list(text_pages)

    with pdfplumber.open(pdf_path) as pdf:
        for i in scanned_pages:
            page = pdf.pages[i]
            try:
                pil_image = page.to_image(resolution=200).original
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    tmp_path = tmp.name
                pil_image.save(tmp_path)

                from services.ocr_service import extract_text_from_image
                page_text = extract_text_from_image(tmp_path)
                if page_text:
                    all_text.append(page_text)
                os.unlink(tmp_path)
            except Exception as e:
                print(f"Page {i} OCR error: {e}")

    return "\n".join(all_text)
