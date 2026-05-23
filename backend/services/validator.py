"""
validator.py — Deterministic post-processing validator for LLM extraction outputs.

Responsibilities:
  1. Parse raw LLM JSON string into ExtractionResult (with Pydantic validation).
  2. Apply domain-specific sanity checks the LLM cannot reliably enforce:
       - Reference-range plausibility per known biomarker
       - Value-range plausibility (physiologically impossible readings)
       - Status consistency with extracted value + reference range
  3. Return a ValidatorReport that summarises all issues found.

The validator is intentionally LENIENT — it annotates problems but only
discards readings that are completely un-parsable or physiologically impossible.
This prevents a single bad OCR token from wiping out an otherwise good report.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from services.schemas import BiomarkerExtraction, BiomarkerStatus, ExtractionResult

logger = logging.getLogger(__name__)

# ── Physiological plausibility guard-rails ────────────────────────────────────
# Format: biomarker_keyword → (absolute_min, absolute_max)
# Values outside this band are almost certainly OCR or LLM errors.
PLAUSIBILITY_BOUNDS: Dict[str, Tuple[float, float]] = {
    "hemoglobin":          (1.0,   25.0),
    "hgb":                 (1.0,   25.0),
    "hb":                  (1.0,   25.0),
    "glucose":             (1.0,  1000.0),
    "blood sugar":         (1.0,  1000.0),
    "fasting glucose":     (1.0,  1000.0),
    "hba1c":               (0.5,   20.0),
    "cholesterol":         (10.0, 1000.0),
    "ldl":                 (10.0,  700.0),
    "hdl":                 (1.0,   200.0),
    "triglycerides":       (10.0, 2000.0),
    "creatinine":          (0.1,   20.0),
    "urea":                (0.5,  200.0),
    "uric acid":           (0.5,   20.0),
    "sodium":              (80.0,  200.0),
    "potassium":           (1.0,   10.0),
    "calcium":             (2.0,   20.0),
    "tsh":                 (0.001, 100.0),
    "vitamin d":           (1.0,   200.0),
    "vitamin b12":         (10.0, 5000.0),
    "ferritin":            (0.5,  5000.0),
    "iron":                (1.0,   500.0),
    "bilirubin":           (0.01,  30.0),
    "alt":                 (1.0,  3000.0),
    "ast":                 (1.0,  3000.0),
    "alkaline phosphatase":(1.0,  3000.0),
    "wbc":                 (0.1,   100.0),
    "rbc":                 (0.5,    10.0),
    "platelets":           (5.0,  3000.0),
}

# ── Known reference ranges for status-consistency cross-check ─────────────────
# Sourced from the original medical_parser.py and expanded.
KNOWN_RANGES: Dict[str, Tuple[Optional[float], Optional[float]]] = {
    "hemoglobin":          (12.0, 17.5),
    "hgb":                 (12.0, 17.5),
    "hb":                  (12.0, 17.5),
    "ldl":                 (None, 130.0),
    "hdl":                 (40.0, None),
    "total cholesterol":   (None, 200.0),
    "cholesterol":         (None, 200.0),
    "blood sugar":         (70.0, 100.0),
    "glucose":             (70.0, 100.0),
    "fasting glucose":     (70.0, 100.0),
    "hba1c":               (None,   5.7),
    "triglycerides":       (None, 150.0),
    "creatinine":          (0.6,    1.2),
    "urea":                (7.0,   20.0),
    "uric acid":           (2.4,    7.0),
    "wbc":                 (4.0,   11.0),
    "rbc":                 (4.2,    5.9),
    "platelets":           (150.0, 400.0),
    "sodium":              (136.0, 145.0),
    "potassium":           (3.5,    5.1),
    "calcium":             (8.6,   10.3),
    "tsh":                 (0.4,    4.0),
    "vitamin d":           (30.0, 100.0),
    "vitamin b12":         (200.0, 900.0),
    "ferritin":            (12.0, 300.0),
    "iron":                (60.0, 170.0),
    "bilirubin":           (None,   1.2),
    "alt":                 (None,  40.0),
    "ast":                 (None,  40.0),
    "alkaline phosphatase":(None, 120.0),
}


@dataclass
class ValidatorReport:
    """Summary of all issues found during validation."""
    is_valid:      bool
    errors:        List[str] = field(default_factory=list)
    warnings:      List[str] = field(default_factory=list)
    discarded:     List[str] = field(default_factory=list)   # biomarker names removed
    corrected:     List[str] = field(default_factory=list)   # auto-corrections applied


def _find_plausibility_key(name: str) -> Optional[str]:
    """
    Return the matching PLAUSIBILITY_BOUNDS key for a biomarker name,
    using substring matching on the lowercased canonical name.
    """
    lower = name.lower()
    for key in PLAUSIBILITY_BOUNDS:
        if key in lower or lower in key:
            return key
    return None


def _infer_status(bm: BiomarkerExtraction) -> str:
    """
    Deterministically derive status from value + reference range.
    Used to correct LLM status when the LLM contradicts the numbers.
    """
    v = bm.value
    rmin = bm.reference_min if bm.reference_min >= 0 else None
    rmax = bm.reference_max if bm.reference_max >= 0 else None

    if rmin is None and rmax is None:
        return BiomarkerStatus.UNKNOWN

    if rmin is not None and v < rmin:
        deviation = (rmin - v) / rmin
        return BiomarkerStatus.CRITICAL if deviation > 0.25 else BiomarkerStatus.LOW

    if rmax is not None and v > rmax:
        deviation = (v - rmax) / rmax
        return BiomarkerStatus.CRITICAL if deviation > 0.25 else BiomarkerStatus.HIGH

    return BiomarkerStatus.NORMAL


def _clean_json_string(raw: str) -> str:
    """
    Strip common LLM output artefacts so json.loads() has a better chance.

    Common problems:
      - Wrapped in ```json ... ``` fences
      - Trailing commas before } or ]
      - Python-style None / True / False instead of JSON null / true / false
      - Smart quotes (U+201C / U+201D → standard double-quote)
    """
    # Remove markdown fences
    raw = re.sub(r"```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    raw = raw.replace("```", "").strip()

    # Smart quotes → ASCII quotes
    raw = raw.replace("\u201c", '"').replace("\u201d", '"')
    raw = raw.replace("\u2018", "'").replace("\u2019", "'")

    # Python literals → JSON literals
    raw = re.sub(r"\bNone\b", "null",  raw)
    raw = re.sub(r"\bTrue\b", "true",  raw)
    raw = re.sub(r"\bFalse\b", "false", raw)

    # Trailing commas before closing bracket / brace
    raw = re.sub(r",\s*([\]}])", r"\1", raw)

    return raw


# ── Public API ─────────────────────────────────────────────────────────────────

def parse_llm_output(raw_text: str) -> Tuple[Optional[ExtractionResult], ValidatorReport]:
    """
    Attempt to parse and validate raw LLM output into ExtractionResult.

    Returns (result, report).  result is None if parsing fails completely.
    """
    report = ValidatorReport(is_valid=False)

    # ── Step 1: JSON extraction ───────────────────────────────────────────────
    cleaned = _clean_json_string(raw_text)

    # If the LLM returned extra prose around the JSON, try to extract the
    # first {...} block before giving up.
    if not cleaned.startswith("{"):
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(0)
        else:
            report.errors.append("LLM output contains no JSON object")
            return None, report

    try:
        raw_dict: Any = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        report.errors.append(f"JSON parse error: {exc}")
        return None, report

    # ── Step 2: Pydantic validation ───────────────────────────────────────────
    try:
        result = ExtractionResult.model_validate(raw_dict)
    except Exception as exc:
        report.errors.append(f"Schema validation error: {exc}")
        # Try to salvage the biomarkers list if patient_info failed
        try:
            raw_dict.setdefault("patient_info", {})
            result = ExtractionResult.model_validate(raw_dict)
        except Exception:
            return None, report

    # ── Step 3: Per-biomarker sanity checks ───────────────────────────────────
    valid_biomarkers: List[BiomarkerExtraction] = []

    for bm in result.biomarkers:
        canon = bm.name.lower().strip()

        # 3a. Physiological plausibility
        plaus_key = _find_plausibility_key(canon)
        if plaus_key:
            abs_min, abs_max = PLAUSIBILITY_BOUNDS[plaus_key]
            if not (abs_min <= bm.value <= abs_max):
                report.discarded.append(
                    f"{bm.name} (value {bm.value} is outside physiological range "
                    f"[{abs_min}, {abs_max}])"
                )
                report.warnings.append(
                    f"Discarded '{bm.name}': value {bm.value} is physiologically impossible"
                )
                continue  # skip this biomarker

        # 3b. Fill missing reference ranges from built-in knowledge base
        if bm.reference_min < 0 or bm.reference_max < 0:
            for key, (kb_min, kb_max) in KNOWN_RANGES.items():
                if key in canon or canon in key:
                    if bm.reference_min < 0 and kb_min is not None:
                        bm.reference_min = kb_min
                        report.corrected.append(
                            f"Filled reference_min for '{bm.name}' from knowledge base"
                        )
                    if bm.reference_max < 0 and kb_max is not None:
                        bm.reference_max = kb_max
                        report.corrected.append(
                            f"Filled reference_max for '{bm.name}' from knowledge base"
                        )
                    break

        # 3c. Status consistency — override if LLM contradicts the numbers
        derived = _infer_status(bm)
        if (
            derived != BiomarkerStatus.UNKNOWN
            and bm.status != BiomarkerStatus.UNKNOWN
            and derived != bm.status
        ):
            report.warnings.append(
                f"Status corrected for '{bm.name}': LLM said '{bm.status}', "
                f"derived '{derived}' from value {bm.value}"
            )
            report.corrected.append(f"Status override for '{bm.name}': {bm.status} → {derived}")
            bm.status = derived
        elif bm.status == BiomarkerStatus.UNKNOWN and derived != BiomarkerStatus.UNKNOWN:
            bm.status = derived

        valid_biomarkers.append(bm)

    result.biomarkers = valid_biomarkers
    report.is_valid = True
    return result, report


def validate_extraction(result: ExtractionResult) -> ValidatorReport:
    """
    Run validation checks on an already-parsed ExtractionResult.
    Used for second-pass validation after fallback parsing.
    """
    report = ValidatorReport(is_valid=True)

    if not result.biomarkers:
        report.warnings.append("No biomarkers were extracted")

    for bm in result.biomarkers:
        if bm.reference_min < 0 and bm.reference_max < 0:
            report.warnings.append(f"No reference range available for '{bm.name}'")

        if bm.status == BiomarkerStatus.UNKNOWN:
            report.warnings.append(f"Status unknown for '{bm.name}'")

    return report
