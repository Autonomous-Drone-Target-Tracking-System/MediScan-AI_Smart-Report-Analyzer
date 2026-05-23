"""
extraction_service.py — LLM-powered biomarker extraction service.

Architecture overview:
  ┌──────────────────────────────────────────────────────────────┐
  │  raw OCR text                                                │
  │       │                                                      │
  │       ▼                                                      │
  │  _preprocess_text()   ← clean, truncate, normalise spacing   │
  │       │                                                      │
  │       ▼                                                      │
  │  _build_prompt()      ← inject into the structured-output    │
  │       │                  extraction prompt template           │
  │       ▼                                                      │
  │  Groq LLM call        ← temperature=0, deterministic         │
  │       │                                                      │
  │       ▼                                                      │
  │  validator.parse_llm_output()  ← JSON clean + Pydantic       │
  │       │                                                      │
  │       ├─── valid? ──► confidence_engine.compute_confidence() │
  │       │                                                      │
  │       └─── invalid? ──► retry (up to MAX_RETRIES)            │
  │                              │                               │
  │                              └─── still invalid? ──►         │
  │                                   regex_fallback()           │
  │                                        │                     │
  │                                        ▼                     │
  │                              confidence_engine.compute()     │
  └──────────────────────────────────────────────────────────────┘

Hallucination prevention strategies:
  1. Temperature = 0 — no sampling randomness.
  2. Explicit JSON schema in the system prompt with field-level constraints.
  3. "ONLY extract values explicitly present" instruction.
  4. Deterministic post-validation that discards physiologically impossible values.
  5. Status is independently re-derived from value + reference range by validator.
"""

from __future__ import annotations

import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

from services.confidence_engine import compute_confidence
from services.schemas import (
    BiomarkerExtraction,
    BiomarkerStatus,
    ExtractionConfidence,
    ExtractionResult,
    PatientInfo,
)
from services.validator import KNOWN_RANGES, parse_llm_output, validate_extraction
# Import the legacy regex parser for fallback
from services.medical_parser import parse_biomarkers as _regex_parse_biomarkers

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────
GROQ_API_KEY  = os.getenv("GROQ_API_KEY", "")
# Use a fast, capable model.  llama-3.3-70b-versatile supports long context.
EXTRACTION_MODEL = os.getenv("EXTRACTION_MODEL", "llama-3.3-70b-versatile")
MAX_RETRIES      = 3          # Maximum LLM retry attempts before fallback
RETRY_DELAY_SEC  = 1.0        # Seconds to wait between retries
# Hard token limit for OCR input — prevents context overflow
MAX_OCR_CHARS    = 6_000

# ── Groq client initialisation ────────────────────────────────────────────────
try:
    from groq import Groq
    _client: Optional[Groq] = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
    GROQ_AVAILABLE = bool(GROQ_API_KEY and _client)
except Exception as _e:
    logger.warning("Groq client init failed: %s", _e)
    _client = None
    GROQ_AVAILABLE = False


# ── Prompt engineering ────────────────────────────────────────────────────────

# The canonical biomarker names we expect — used in the prompt to anchor naming.
_CANONICAL_NAMES = (
    "Hemoglobin, WBC, RBC, Platelet Count, "
    "LDL Cholesterol, HDL Cholesterol, Total Cholesterol, Triglycerides, "
    "Blood Sugar (Fasting), HbA1c, Creatinine, Urea, Uric Acid, "
    "Sodium, Potassium, Calcium, TSH, "
    "Vitamin D, Vitamin B12, Ferritin, Iron, Bilirubin, ALT, AST, "
    "Alkaline Phosphatase"
)

# NOTE: The JSON schema block is embedded verbatim so the LLM can see the
#       exact structure it must produce.  This dramatically reduces format errors.
_SYSTEM_PROMPT = f"""You are a highly accurate medical report data extraction engine.

Your ONLY task is to extract structured data from OCR text of medical lab reports and output valid JSON.

## CRITICAL RULES (MUST FOLLOW)
1. ONLY extract values that are EXPLICITLY PRESENT in the text — do NOT invent, guess, or extrapolate any numbers.
2. Output ONLY a single JSON object — no explanation, no markdown, no extra text.
3. If a field cannot be found, use the exact sentinel values defined below.
4. Biomarker names MUST be normalised to standard medical terminology.
   Preferred names: {_CANONICAL_NAMES}
5. If the OCR text is corrupted or unreadable for a specific biomarker, SKIP it entirely.
6. Do NOT duplicate biomarkers — if a name appears multiple times, use the first valid numeric reading.
7. Status field MUST be one of: "Normal", "Low", "High", "Critical", "Unknown".
   Derive it from the value vs. reference range provided in the report.
   If you cannot determine status confidently, use "Unknown".
8. Reference range values must be numeric floats. If absent, use -1.

## OUTPUT JSON SCHEMA (strict)
{{
  "patient_info": {{
    "name":   "<string — patient full name, or 'Unknown'>",
    "age":    "<string — age with unit e.g. '45Y', or 'Unknown'>",
    "gender": "<string — 'Male', 'Female', or 'Unknown'>"
  }},
  "biomarkers": [
    {{
      "name":          "<string — standardised biomarker name>",
      "value":         <float — numeric reading ONLY>,
      "unit":          "<string — unit as printed, e.g. 'g/dL'>",
      "reference_min": <float — lower reference bound, or -1 if absent>,
      "reference_max": <float — upper reference bound, or -1 if absent>,
      "status":        "<'Normal'|'Low'|'High'|'Critical'|'Unknown'>"
    }}
  ]
}}

## HALLUCINATION PREVENTION
- The biomarker array MAY be empty [] if no valid numeric readings are found.
- Never fill in a value field with anything other than a number you read from the text.
- Never assume reference ranges — extract them from the report or use -1.
- Report text may be noisy (OCR artefacts) — focus on clearly numeric lines.
"""

_USER_PROMPT_TEMPLATE = """Extract all medical biomarker data from the following OCR text.
Follow the system instructions exactly.

OCR TEXT:
\"\"\"
{ocr_text}
\"\"\"

Respond with ONLY the JSON object. No explanation. No markdown. No preamble."""


# ── Text pre-processing ───────────────────────────────────────────────────────

def _preprocess_text(raw: str) -> str:
    """
    Normalise OCR text before feeding to the LLM.

    Transformations applied:
      - Strip excessive whitespace / blank lines (table misalignment fix)
      - Collapse repeated special chars (OCR noise artefacts)
      - Truncate to MAX_OCR_CHARS from the most content-rich portion
    """
    # Collapse runs of whitespace / special characters
    text = re.sub(r"[ \t]{3,}", "  ", raw)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Remove control characters except newlines
    text = re.sub(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]", "", text)
    # Truncate — keep first MAX_OCR_CHARS chars (headers usually contain patient info)
    if len(text) > MAX_OCR_CHARS:
        text = text[:MAX_OCR_CHARS] + "\n[...truncated for length...]"
    return text.strip()


# ── Biomarker name normalisation ──────────────────────────────────────────────

# Mapping from common variant names → canonical display names
_NAME_NORMALISATION: Dict[str, str] = {
    "hgb":               "Hemoglobin",
    "hb":                "Hemoglobin",
    "haemoglobin":       "Hemoglobin",
    "ldl":               "LDL Cholesterol",
    "ldl-c":             "LDL Cholesterol",
    "ldl cholesterol":   "LDL Cholesterol",
    "hdl":               "HDL Cholesterol",
    "hdl-c":             "HDL Cholesterol",
    "hdl cholesterol":   "HDL Cholesterol",
    "total cholesterol": "Total Cholesterol",
    "cholesterol":       "Total Cholesterol",
    "blood sugar":       "Blood Sugar (Fasting)",
    "fasting glucose":   "Blood Sugar (Fasting)",
    "glucose":           "Blood Sugar (Fasting)",
    "blood glucose":     "Blood Sugar (Fasting)",
    "hba1c":             "HbA1c",
    "glycated haemoglobin": "HbA1c",
    "tsh":               "TSH",
    "thyroid stimulating hormone": "TSH",
    "wbc":               "WBC",
    "white blood cells": "WBC",
    "white blood count": "WBC",
    "rbc":               "RBC",
    "red blood cells":   "RBC",
    "red blood count":   "RBC",
    "platelet count":    "Platelet Count",
    "platelets":         "Platelet Count",
    "plt":               "Platelet Count",
    "vitamin d":         "Vitamin D",
    "vit d":             "Vitamin D",
    "25-oh vitamin d":   "Vitamin D",
    "vitamin b12":       "Vitamin B12",
    "vit b12":           "Vitamin B12",
    "cobalamin":         "Vitamin B12",
    "alt":               "ALT",
    "sgpt":              "ALT",
    "alanine aminotransferase": "ALT",
    "ast":               "AST",
    "sgot":              "AST",
    "aspartate aminotransferase": "AST",
    "alkaline phosphatase": "Alkaline Phosphatase",
    "alp":               "Alkaline Phosphatase",
    "bilirubin":         "Bilirubin",
    "total bilirubin":   "Bilirubin",
    "creatinine":        "Creatinine",
    "serum creatinine":  "Creatinine",
    "urea":              "Urea",
    "blood urea":        "Urea",
    "bun":               "Urea",
    "uric acid":         "Uric Acid",
    "serum uric acid":   "Uric Acid",
    "sodium":            "Sodium",
    "na":                "Sodium",
    "potassium":         "Potassium",
    "k":                 "Potassium",
    "calcium":           "Calcium",
    "ca":                "Calcium",
    "ferritin":          "Ferritin",
    "iron":              "Iron",
    "serum iron":        "Iron",
    "triglycerides":     "Triglycerides",
    "tg":                "Triglycerides",
    "trigs":             "Triglycerides",
}


def normalise_biomarker_name(name: str) -> str:
    """
    Map free-form LLM biomarker names to canonical display names.
    Falls back to title-casing the original name if no mapping found.
    """
    lower = name.lower().strip()
    # Exact match first
    if lower in _NAME_NORMALISATION:
        return _NAME_NORMALISATION[lower]
    # Substring match — find the longest key that appears in the name
    best_match, best_len = None, 0
    for key, canonical in _NAME_NORMALISATION.items():
        if key in lower and len(key) > best_len:
            best_match, best_len = canonical, len(key)
    return best_match if best_match else name.title()


# ── Regex fallback ────────────────────────────────────────────────────────────

def _regex_fallback(raw_text: str) -> ExtractionResult:
    """
    Invoke the legacy regex parser and adapt its output to ExtractionResult.

    This is the last-resort path when all LLM attempts fail.
    The regex parser is less accurate but deterministic and always produces
    some output as long as the OCR text contains recognisable patterns.
    """
    logger.warning("[Extraction] Using regex fallback parser")
    parsed = _regex_parse_biomarkers(raw_text)

    biomarkers: List[BiomarkerExtraction] = []
    for p in parsed:
        try:
            rmin = p.get("ref_low")  if p.get("ref_low")  is not None else -1.0
            rmax = p.get("ref_high") if p.get("ref_high") is not None else -1.0
            value = float(p.get("value", 0))

            # Derive status deterministically from value and range
            if rmin >= 0 and value < rmin:
                status = BiomarkerStatus.CRITICAL if (rmin - value) / rmin > 0.25 else BiomarkerStatus.LOW
            elif rmax >= 0 and value > rmax:
                status = BiomarkerStatus.CRITICAL if (value - rmax) / rmax > 0.25 else BiomarkerStatus.HIGH
            elif rmin >= 0 or rmax >= 0:
                status = BiomarkerStatus.NORMAL
            else:
                status = BiomarkerStatus.UNKNOWN

            bm = BiomarkerExtraction(
                name          = normalise_biomarker_name(p.get("marker_name", "Unknown")),
                value         = value,
                unit          = p.get("unit", ""),
                reference_min = rmin,
                reference_max = rmax,
                status        = status,
            )
            biomarkers.append(bm)
        except Exception as exc:
            logger.debug("Skipping regex result due to: %s", exc)

    return ExtractionResult(patient_info=PatientInfo(), biomarkers=biomarkers)


# ── LLM call ──────────────────────────────────────────────────────────────────

def _call_groq(ocr_text: str) -> str:
    """
    Send the extraction prompt to Groq and return raw response text.
    Raises RuntimeError if the call fails.
    """
    if not GROQ_AVAILABLE or not _client:
        raise RuntimeError("Groq client is not available")

    user_prompt = _USER_PROMPT_TEMPLATE.format(ocr_text=ocr_text)

    response = _client.chat.completions.create(
        model=EXTRACTION_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0,          # Fully deterministic — critical for medical data
        max_tokens=2048,        # Should comfortably cover any lab panel
        top_p=1,
        stream=False,
    )
    return response.choices[0].message.content.strip()


# ── Public API ─────────────────────────────────────────────────────────────────

def extract_biomarkers(
    raw_text: str,
) -> Tuple[ExtractionResult, ExtractionConfidence]:
    """
    Main entry point for LLM-powered biomarker extraction.

    Workflow:
      1. Pre-process OCR text.
      2. Call Groq LLM with structured prompt.
      3. Validate output; retry on failure.
      4. Fall back to regex parser if all retries exhausted.
      5. Compute confidence score.

    Returns:
        (ExtractionResult, ExtractionConfidence)
    """
    preprocessed = _preprocess_text(raw_text)
    retry_count   = 0
    used_fallback = False
    result: Optional[ExtractionResult] = None

    # ── LLM extraction with retry loop ────────────────────────────────────────
    if GROQ_AVAILABLE:
        for attempt in range(1, MAX_RETRIES + 1):
            logger.info("[Extraction] LLM attempt %d/%d", attempt, MAX_RETRIES)
            try:
                raw_llm_output = _call_groq(preprocessed)
                logger.debug("[Extraction] Raw LLM output:\n%s", raw_llm_output)

                parsed_result, vreport = parse_llm_output(raw_llm_output)

                if parsed_result is not None and vreport.is_valid:
                    # Normalise biomarker names post-validation
                    for bm in parsed_result.biomarkers:
                        bm.name = normalise_biomarker_name(bm.name)
                    result = parsed_result
                    retry_count = attempt - 1
                    logger.info(
                        "[Extraction] Success on attempt %d — %d biomarkers extracted",
                        attempt, len(result.biomarkers),
                    )
                    break
                else:
                    logger.warning(
                        "[Extraction] Attempt %d invalid: %s",
                        attempt, vreport.errors,
                    )
                    retry_count = attempt

            except Exception as exc:
                logger.error("[Extraction] LLM call error on attempt %d: %s", attempt, exc)
                retry_count = attempt

            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY_SEC)
    else:
        logger.warning("[Extraction] Groq not available, going straight to fallback")

    # ── Fallback if LLM failed ────────────────────────────────────────────────
    if result is None:
        logger.warning("[Extraction] All LLM attempts failed. Using regex fallback.")
        result = _regex_fallback(preprocessed)
        used_fallback = True

    # ── Final validation pass ──────────────────────────────────────────────────
    vreport_final = validate_extraction(result)

    # ── Confidence scoring ────────────────────────────────────────────────────
    confidence = compute_confidence(
        result       = result,
        vreport      = vreport_final,
        retry_count  = retry_count,
        used_fallback = used_fallback,
    )

    logger.info(
        "[Extraction] Final: %d biomarkers, confidence=%.3f (%s), fallback=%s",
        len(result.biomarkers),
        confidence.overall_score,
        "High" if confidence.overall_score >= 0.75 else
        "Medium" if confidence.overall_score >= 0.40 else "Low",
        used_fallback,
    )

    return result, confidence


def get_extraction_status() -> Dict[str, Any]:
    """Health-check utility — returns service status and model info."""
    return {
        "groq_available":    GROQ_AVAILABLE,
        "extraction_model":  EXTRACTION_MODEL,
        "max_retries":       MAX_RETRIES,
        "max_ocr_chars":     MAX_OCR_CHARS,
        "fallback_available": True,   # regex parser always available
    }
