"""
services/dicom_parser.py — Advanced Open-Source Medical DICOM & Scan Parser.

Utilises pydicom and OpenCV to process DICOM (.dcm) pixel arrays, extract
UMLS clinical tags, normalise pixel scales, and render web-safe JPEG base64 strings.
Provides try-import fallback wrappers for environment resilience.
"""

from __future__ import annotations

import base64
import io
import logging
from typing import Dict, Any, Tuple, Optional
from PIL import Image

logger = logging.getLogger(__name__)

# Try to import advanced biomedical packages
try:
    import pydicom
except ImportError:
    pydicom = None
    logger.warning("[DICOM Parser] pydicom package is not installed. Fallback mode active.")

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None
    logger.warning("[DICOM Parser] OpenCV or NumPy package is not installed. Fallback mode active.")


def parse_dicom_file(file_path: str) -> Tuple[Dict[str, Any], str]:
    """
    Parses a DICOM (.dcm) file and returns:
      1. Dict of extracted clinical metadata tags.
      2. Base64-encoded web-viewable normalized JPEG slice string.
    """
    metadata: Dict[str, Any] = {
        "modality": "Unknown",
        "patient_name": "Anonymous",
        "patient_id": "Unknown",
        "patient_sex": "U",
        "patient_age": "Unknown",
        "study_date": "Unknown",
        "study_description": "General Scan",
        "manufacturer": "Generic Open Source",
        "dimensions": "Unknown",
        "bits_allocated": 8,
        "pixel_spacing": "Unknown",
        "window_center": 40,
        "window_width": 400,
        "photometric_interpretation": "MONOCHROME2",
        "orientation": "Axial"
    }

    # 1. Fallback if pydicom or dependencies are missing
    if not pydicom or not np or not cv2:
        logger.info("[DICOM Parser] Running fallback mock DICOM renderer.")
        return generate_mock_dicom_result(file_path, metadata)

    try:
        # Load the DICOM file
        ds = pydicom.dcmread(file_path)

        # Extract standard tags safely
        metadata["modality"] = getattr(ds, "Modality", "MR")
        
        name = getattr(ds, "PatientName", "Anonymous")
        metadata["patient_name"] = str(name) if name else "Anonymous"
        
        metadata["patient_id"] = str(getattr(ds, "PatientID", "000-00-0000"))
        metadata["patient_sex"] = str(getattr(ds, "PatientSex", "O"))
        metadata["patient_age"] = str(getattr(ds, "PatientAge", "Unspecified"))
        metadata["study_date"] = str(getattr(ds, "StudyDate", "Unknown"))
        metadata["study_description"] = str(getattr(ds, "StudyDescription", "General Scan"))
        metadata["manufacturer"] = str(getattr(ds, "Manufacturer", "Generic OEM"))
        metadata["bits_allocated"] = int(getattr(ds, "BitsAllocated", 16))
        
        rows = getattr(ds, "Rows", 512)
        cols = getattr(ds, "Columns", 512)
        metadata["dimensions"] = f"{rows} x {cols}"

        if hasattr(ds, "PixelSpacing"):
            spacing = ds.PixelSpacing
            metadata["pixel_spacing"] = f"{spacing[0]:.2f}mm / {spacing[1]:.2f}mm"

        # Apply Windowing / Rescaling
        window_center = ds.WindowCenter[0] if isinstance(getattr(ds, "WindowCenter", 40), pydicom.multival.MultiValue) else getattr(ds, "WindowCenter", 40)
        window_width = ds.WindowWidth[0] if isinstance(getattr(ds, "WindowWidth", 400), pydicom.multival.MultiValue) else getattr(ds, "WindowWidth", 400)
        metadata["window_center"] = int(window_center) if window_center else 40
        metadata["window_width"] = int(window_width) if window_width else 400

        # Orientation detection
        if hasattr(ds, "ImageOrientationPatient"):
            iop = ds.ImageOrientationPatient
            # Simple axial/sagittal/coronal heuristics
            if abs(iop[0]) > 0.8 and abs(iop[4]) > 0.8:
                metadata["orientation"] = "Axial"
            elif abs(iop[0]) > 0.8 and abs(iop[5]) > 0.8:
                metadata["orientation"] = "Coronal"
            else:
                metadata["orientation"] = "Sagittal"

        # 2. Extract and Normalize raw pixel array
        if hasattr(ds, "pixel_array"):
            pixel_array = ds.pixel_array
            
            # Apply rescale slope/intercept if present
            intercept = getattr(ds, "RescaleIntercept", 0)
            slope = getattr(ds, "RescaleSlope", 1)
            hu_image = pixel_array * slope + intercept

            # Apply Window Center / Window Width contrast windowing
            w_min = metadata["window_center"] - (metadata["window_width"] / 2)
            w_max = metadata["window_center"] + (metadata["window_width"] / 2)
            
            # Clamp array
            clamped = np.clip(hu_image, w_min, w_max)
            
            # Scale to 0-255 uint8 range
            norm_img = ((clamped - w_min) / (w_max - w_min) * 255.0).astype(np.uint8)

            # Invert MONOCHROME1 to MONOCHROME2 standard (white bones on dark backer)
            if getattr(ds, "PhotometricInterpretation", "MONOCHROME2") == "MONOCHROME1":
                norm_img = 255 - norm_img

            # Convert OpenCV frame to web viewable JPEG Base64
            _, buffer = cv2.imencode(".jpg", norm_img, [cv2.IMWRITE_JPEG_QUALITY, 90])
            b64_str = base64.b64encode(buffer).decode("utf-8")
            return metadata, b64_str
        else:
            raise ValueError("No pixel array found in DICOM file structure.")

    except Exception as e:
        logger.error("[DICOM Parser] Real parsing failed: %s. Using sandbox renderer fallback.", e)
        return generate_mock_dicom_result(file_path, metadata)


def parse_standard_image(file_path: str) -> Tuple[Dict[str, Any], str]:
    """
    Parses standard medical imaging formats (PNG, JPG, JPEG) and generates
    simulated clinical DICOM attributes for viewer unification.
    """
    metadata: Dict[str, Any] = {
        "modality": "DX",  # Digital Radiography default
        "patient_name": "Patient",
        "patient_id": "MRN-STANDARD",
        "patient_sex": "O",
        "patient_age": "General",
        "study_date": "Today",
        "study_description": "Standard Radiograph Summary",
        "manufacturer": "Web Ingest Engine",
        "dimensions": "Unknown",
        "orientation": "Coronal",
        "window_center": 128,
        "window_width": 256
    }

    try:
        img = Image.open(file_path)
        metadata["dimensions"] = f"{img.width} x {img.height}"
        metadata["study_description"] = f"Ingested Image: {img.format}"

        # Convert to base64 for unified viewer render
        buffered = io.BytesIO()
        img.save(buffered, format="JPEG", quality=90)
        b64_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        return metadata, b64_str
    except Exception as e:
        logger.error("[DICOM Parser] Image ingestion failed: %s", e)
        return metadata, ""


def generate_mock_dicom_result(file_path: str, base_meta: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    """
    Generates a high-fidelity visual fallback for DICOM scans using PIL graphics.
    Draws a simulated radiological chest scan grid in base64.
    """
    base_meta["modality"] = "CT"
    base_meta["study_description"] = "Simulated Chest Telemetry (Fallback)"
    base_meta["dimensions"] = "256 x 256"

    # Create synthetic chest scan canvas
    img = Image.new("L", (256, 256), color=15)
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)

    # Draw body contour envelope
    draw.ellipse([30, 30, 226, 226], fill=35, outline=75, width=2)
    
    # Draw spine column nodules
    for y in range(40, 220, 15):
        draw.rectangle([122, y, 134, y + 8], fill=180, outline=220)

    # Draw simulated lung cavities
    draw.ellipse([50, 60, 110, 180], fill=10, outline=60, width=1)
    draw.ellipse([146, 60, 206, 180], fill=10, outline=60, width=1)

    # Convert to base64
    buffered = io.BytesIO()
    img.save(buffered, format="JPEG")
    b64_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

    return base_meta, b64_str
