"""
Medical parser: regex-based biomarker extraction from OCR text.
Includes a reference ranges dictionary and risk classification logic.
"""

import re
from typing import List, Dict, Any

# ──────────────────────────────────────────────────────────────────────────────
# Reference ranges database
# Format: { marker_name: { "low": ..., "high": ..., "unit": ... } }
# None means "no lower bound" or "no upper bound"
# ──────────────────────────────────────────────────────────────────────────────
REFERENCE_RANGES: Dict[str, Dict] = {
    "hemoglobin":        {"low": 12.0, "high": 17.5, "unit": "g/dl"},
    "hgb":               {"low": 12.0, "high": 17.5, "unit": "g/dl"},
    "hb":                {"low": 12.0, "high": 17.5, "unit": "g/dl"},
    "ldl":               {"low": None, "high": 130.0, "unit": "mg/dl"},
    "ldl cholesterol":   {"low": None, "high": 130.0, "unit": "mg/dl"},
    "hdl":               {"low": 40.0, "high": None,  "unit": "mg/dl"},
    "hdl cholesterol":   {"low": 40.0, "high": None,  "unit": "mg/dl"},
    "total cholesterol": {"low": None, "high": 200.0, "unit": "mg/dl"},
    "cholesterol":       {"low": None, "high": 200.0, "unit": "mg/dl"},
    "blood sugar":       {"low": 70.0, "high": 100.0, "unit": "mg/dl"},
    "glucose":           {"low": 70.0, "high": 100.0, "unit": "mg/dl"},
    "fasting glucose":   {"low": 70.0, "high": 100.0, "unit": "mg/dl"},
    "hba1c":             {"low": None, "high": 5.7,   "unit": "%"},
    "triglycerides":     {"low": None, "high": 150.0, "unit": "mg/dl"},
    "creatinine":        {"low": 0.6,  "high": 1.2,   "unit": "mg/dl"},
    "urea":              {"low": 7.0,  "high": 20.0,  "unit": "mg/dl"},
    "uric acid":         {"low": 2.4,  "high": 7.0,   "unit": "mg/dl"},
    "wbc":               {"low": 4.0,  "high": 11.0,  "unit": "10^3/ul"},
    "white blood cells": {"low": 4.0,  "high": 11.0,  "unit": "10^3/ul"},
    "rbc":               {"low": 4.2,  "high": 5.9,   "unit": "10^6/ul"},
    "platelets":         {"low": 150.0,"high": 400.0, "unit": "10^3/ul"},
    "platelet count":    {"low": 150.0,"high": 400.0, "unit": "10^3/ul"},
    "sodium":            {"low": 136.0,"high": 145.0, "unit": "meq/l"},
    "potassium":         {"low": 3.5,  "high": 5.1,   "unit": "meq/l"},
    "calcium":           {"low": 8.6,  "high": 10.3,  "unit": "mg/dl"},
    "tsh":               {"low": 0.4,  "high": 4.0,   "unit": "miu/l"},
    "vitamin d":         {"low": 30.0, "high": 100.0, "unit": "ng/ml"},
    "vitamin b12":       {"low": 200.0,"high": 900.0, "unit": "pg/ml"},
    "ferritin":          {"low": 12.0, "high": 300.0, "unit": "ng/ml"},
    "iron":              {"low": 60.0, "high": 170.0, "unit": "ug/dl"},
    "bilirubin":         {"low": None, "high": 1.2,   "unit": "mg/dl"},
    "alt":               {"low": None, "high": 40.0,  "unit": "u/l"},
    "ast":               {"low": None, "high": 40.0,  "unit": "u/l"},
    "alkaline phosphatase": {"low": None, "high": 120.0, "unit": "u/l"},
}

# ──────────────────────────────────────────────────────────────────────────────
# Canonical display names
# ──────────────────────────────────────────────────────────────────────────────
DISPLAY_NAMES = {
    "hgb": "Hemoglobin", "hb": "Hemoglobin",
    "ldl": "LDL Cholesterol", "ldl cholesterol": "LDL Cholesterol",
    "hdl": "HDL Cholesterol", "hdl cholesterol": "HDL Cholesterol",
    "blood sugar": "Blood Sugar (Fasting)", "glucose": "Blood Sugar (Fasting)",
    "fasting glucose": "Blood Sugar (Fasting)",
    "wbc": "White Blood Cells (WBC)", "white blood cells": "White Blood Cells (WBC)",
    "rbc": "Red Blood Cells (RBC)",
    "platelets": "Platelet Count", "platelet count": "Platelet Count",
    "alt": "ALT (Liver Enzyme)", "ast": "AST (Liver Enzyme)",
    "alkaline phosphatase": "Alkaline Phosphatase",
    "tsh": "TSH (Thyroid)", "vitamin d": "Vitamin D",
    "vitamin b12": "Vitamin B12", "hba1c": "HbA1c (Avg Blood Sugar)",
}


def parse_biomarkers(raw_text: str) -> List[Dict[str, Any]]:
    """Extract biomarker readings from OCR text using regex patterns."""
    results = []
    seen_keys = set()

    # Pattern: "MarkerName: 8.5 g/dL" or "MarkerName  8.5  g/dL"
    pattern = re.compile(
        r"([A-Za-z][A-Za-z0-9\s/\(\)]{1,40}?)\s*[:\-]?\s*(\d{1,5}(?:\.\d{1,3})?)\s*([A-Za-z/%^*µ]{1,12}(?:/[A-Za-z^*µ\d]{1,12})?)?",
        re.IGNORECASE,
    )

    for match in pattern.finditer(raw_text):
        raw_name = match.group(1).strip().lower().rstrip(":- ")
        raw_value = match.group(2).strip()
        raw_unit = (match.group(3) or "").strip()

        # Look up in reference ranges
        ref = None
        matched_key = None
        for key in REFERENCE_RANGES:
            if key in raw_name or raw_name in key:
                ref = REFERENCE_RANGES[key]
                matched_key = key
                break

        if ref is None:
            continue  # Skip unrecognized markers

        if matched_key in seen_keys:
            continue
        seen_keys.add(matched_key)

        try:
            value = float(raw_value)
        except ValueError:
            continue

        unit = raw_unit if raw_unit else ref.get("unit", "")
        display_name = DISPLAY_NAMES.get(matched_key, matched_key.title())

        results.append({
            "marker_name": display_name,
            "value": value,
            "unit": unit,
            "ref_low": ref.get("low"),
            "ref_high": ref.get("high"),
            "_key": matched_key,
        })

    return results
