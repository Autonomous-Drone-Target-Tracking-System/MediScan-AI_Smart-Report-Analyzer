"""
OCR service using OCR.space API (primary).
Falls back to local Tesseract if API fails.
Handles both images and PDFs (up to 5 pages via OCR.space).
"""

import os
import requests
import base64
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

OCR_SPACE_API_KEY = os.getenv("OCR_SPACE_API_KEY", "")
OCR_SPACE_URL = "https://api.ocr.space/parse/image"

# OCR.space engine options:
# 1 = Tesseract (fast, English), 2 = OCR.space (better tables), 3 = ABBYY
DEFAULT_ENGINE = 2


def _call_ocrspace(file_path: str, file_type: str = "image") -> str:
    """
    Call OCR.space API with a local file.
    file_type: "image" or "pdf"
    Returns extracted text or empty string on failure.
    """
    if not OCR_SPACE_API_KEY:
        return ""

    try:
        ext = Path(file_path).suffix.lower()
        mime_map = {
            ".pdf": "application/pdf",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".bmp": "image/bmp",
            ".tiff": "image/tiff",
            ".tif": "image/tiff",
        }
        mime = mime_map.get(ext, "image/png")

        with open(file_path, "rb") as f:
            file_bytes = f.read()

        payload = {
            "apikey": OCR_SPACE_API_KEY,
            "language": "eng",
            "isOverlayRequired": False,
            "detectOrientation": True,
            "scale": True,
            "OCREngine": DEFAULT_ENGINE,
            "isTable": True,           # Better for medical reports with tabular data
            "filetype": ext.lstrip(".").upper(),
        }

        files = {"file": (Path(file_path).name, file_bytes, mime)}

        response = requests.post(
            OCR_SPACE_URL,
            data=payload,
            files=files,
            timeout=30,
        )
        response.raise_for_status()
        result = response.json()

        if result.get("IsErroredOnProcessing"):
            err = result.get("ErrorMessage", ["Unknown OCR.space error"])
            print(f"OCR.space error: {err}")
            return ""

        # Concatenate all parsed text from all pages
        texts = []
        for page in result.get("ParsedResults", []):
            text = page.get("ParsedText", "")
            if text:
                texts.append(text)

        extracted = "\n".join(texts)
        print(f"OCR.space extracted {len(extracted)} chars from {Path(file_path).name}")
        return extracted

    except requests.exceptions.Timeout:
        print("OCR.space API timeout — falling back to local OCR")
        return ""
    except Exception as e:
        print(f"OCR.space API error: {e}")
        return ""


def _local_tesseract_fallback(image_path: str) -> str:
    """Local Tesseract fallback with OpenCV preprocessing."""
    try:
        import cv2
        import pytesseract

        img = cv2.imread(image_path)
        if img is None:
            return ""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        denoised = cv2.fastNlMeansDenoising(gray, h=10)
        _, thresh = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        text = pytesseract.image_to_string(thresh, config="--psm 6")
        return text
    except Exception as e:
        print(f"Tesseract fallback error: {e}")
        return ""


def extract_text_from_image(image_path: str) -> str:
    """Extract text from an image file."""
    # Try OCR.space first
    text = _call_ocrspace(image_path, file_type="image")
    if text.strip():
        return text

    # Fallback: local Tesseract
    print("Falling back to local Tesseract for image...")
    return _local_tesseract_fallback(image_path)
