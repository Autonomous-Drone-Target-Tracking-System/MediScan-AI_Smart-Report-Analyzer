"""
pipeline.py — Main analysis pipeline: OCR → LLM Extract → Classify → Score → AI Explain → Persist

The pipeline is deliberately thin — it orchestrates the service layer,
which handles all complexity.  Each step is logged clearly so failures
are easy to pinpoint.

Step overview:
  1. OCR        — extract raw text from uploaded file
  2. Extract    — LLM-powered biomarker + patient-info extraction (with fallback)
  3. Enrich     — adapt ExtractionResult to the existing risk_engine dict format
  4. Score      — calculate health score from risk classifications
  5. AI Explain — per-biomarker plain-English explanations + overall summary
  6. Persist    — write results to the SQLite database
  7. Return     — structured dict consumed by the FastAPI route
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from services.ocr_router import extract_text
from services.extraction_service import extract_biomarkers
from services.risk_engine import enrich_biomarkers, calculate_health_score
from services.ai_service import (
    generate_biomarker_explanation,
    generate_overall_summary,
    generate_recommendations,
)
from services.schemas import BiomarkerExtraction, ExtractionResult
from db.crud import insert_biomarkers, update_health_score, persist_analysis_metadata

logger = logging.getLogger(__name__)


# ── Adaptor: ExtractionResult → risk_engine dict format ──────────────────────

def _extraction_to_pipeline_dicts(
    result: ExtractionResult,
) -> List[Dict[str, Any]]:
    """
    Convert the typed ExtractionResult into the flat dict format expected by
    risk_engine.enrich_biomarkers() and the rest of the existing pipeline.

    The sentinel value -1 for absent reference bounds is converted back to
    None so the risk engine's comparisons (value < ref_low) work correctly.
    """
    dicts: List[Dict[str, Any]] = []
    for bm in result.biomarkers:
        dicts.append({
            "marker_name": bm.name,
            "value":       bm.value,
            "unit":        bm.unit,
            # Convert sentinel -1 → None for risk_engine compatibility
            "ref_low":     bm.reference_min if bm.reference_min >= 0 else None,
            "ref_high":    bm.reference_max if bm.reference_max >= 0 else None,
            # Pre-set risk_category from the LLM-derived status so enrich_biomarkers
            # can optionally override with its own rule-based check
            "risk_category": _status_to_risk(bm),
            "_key":        bm.name.lower(),
        })
    return dicts


def _status_to_risk(bm: BiomarkerExtraction) -> str:
    """Map BiomarkerStatus → risk_engine risk_category string."""
    mapping = {
        "Normal":   "Normal",
        "Low":      "Moderate",
        "High":     "Moderate",
        "Critical": "Critical",
        "Unknown":  "Normal",   # conservative default
    }
    return mapping.get(str(bm.status), "Normal")


# ── Main pipeline ─────────────────────────────────────────────────────────────

def run_analysis(file_path: str, report_id: int) -> Dict[str, Any]:
    """
    Full analysis pipeline for a single uploaded medical report.

    Returns a dict matching the AnalysisResult schema expected by the
    FastAPI route layer.
    """
    # ── Step 1: OCR ───────────────────────────────────────────────────────────
    logger.info("[Pipeline] Running OCR on: %s", file_path)
    raw_text = extract_text(file_path)
    logger.info("[Pipeline] OCR extracted %d characters", len(raw_text))

    # ── Step 2: LLM extraction ────────────────────────────────────────────────
    logger.info("[Pipeline] Running LLM biomarker extraction")
    extraction_result, confidence = extract_biomarkers(raw_text)

    logger.info(
        "[Pipeline] Extraction complete: %d biomarkers, confidence=%.3f, fallback=%s",
        len(extraction_result.biomarkers),
        confidence.overall_score,
        confidence.used_fallback,
    )

    # Log confidence warnings at the appropriate severity
    for warning in confidence.warnings:
        logger.warning("[Pipeline] Confidence warning: %s", warning)

    # ── Step 3: Adapt to risk_engine format ──────────────────────────────────
    pipeline_dicts = _extraction_to_pipeline_dicts(extraction_result)

    # ── Step 4: Risk classification (rule-based override) ─────────────────────
    # enrich_biomarkers() re-derives risk_category from ref_low/ref_high values.
    # This acts as a deterministic double-check on the LLM's status field.
    enriched = enrich_biomarkers(pipeline_dicts)

    # ── Step 5: Health score ──────────────────────────────────────────────────
    health_score = calculate_health_score(enriched)
    logger.info("[Pipeline] Health score: %d", health_score)

    # ── Step 6: AI explanations (per-marker) ─────────────────────────────────
    for b in enriched:
        b["ai_explanation"] = generate_biomarker_explanation(
            b["marker_name"], b["value"], b["unit"], b["risk_category"]
        )

    # ── Step 7: AI summary + recommendations ─────────────────────────────────
    ai_summary      = generate_overall_summary(enriched, health_score)
    recommendations = generate_recommendations(enriched)

    # ── Step 8: Patient info passthrough ─────────────────────────────────────
    patient_info = {
        "name":   extraction_result.patient_info.name,
        "age":    extraction_result.patient_info.age,
        "gender": extraction_result.patient_info.gender,
    }

    # ── Step 9: Persist ───────────────────────────────────────────────────────
    update_health_score(report_id, health_score)
    insert_biomarkers(report_id, enriched)
    persist_analysis_metadata(report_id, ai_summary, recommendations)

    return {
        "report_id":      report_id,
        "health_score":   health_score,
        "biomarkers":     enriched,
        "ai_summary":     ai_summary,
        "recommendations": recommendations,
        "patient_info":   patient_info,
        "extraction_confidence": {
            "overall_score":      confidence.overall_score,
            "biomarker_count":    confidence.biomarker_count,
            "used_fallback":      confidence.used_fallback,
            "confidence_level":   (
                "High"   if confidence.overall_score >= 0.75 else
                "Medium" if confidence.overall_score >= 0.40 else
                "Low"
            ),
            "warnings":           confidence.warnings,
        },
    }
