"""
Main analysis pipeline: OCR → Parse → Classify → Score → AI Explain → Persist
"""

from typing import Dict, Any

from services.ocr_router import extract_text
from services.medical_parser import parse_biomarkers
from services.risk_engine import enrich_biomarkers, calculate_health_score
from services.ai_service import (
    generate_biomarker_explanation,
    generate_overall_summary,
    generate_recommendations,
)
from db.crud import insert_biomarkers, update_health_score, persist_analysis_metadata


def run_analysis(file_path: str, report_id: int) -> Dict[str, Any]:
    """
    Full pipeline for a single uploaded medical report.

    Returns a dict matching the AnalysisResult schema.
    """
    # Step 1 — OCR
    print(f"[OCR] Running on: {file_path}")
    raw_text = extract_text(file_path)
    print(f"   OCR extracted {len(raw_text)} characters")

    # Step 2 — Parse biomarkers
    parsed = parse_biomarkers(raw_text)
    print(f"   Found {len(parsed)} biomarkers")

    # Step 3 — Classify risk
    enriched = enrich_biomarkers(parsed)

    # Step 4 — Calculate health score
    health_score = calculate_health_score(enriched)
    print(f"   Health score: {health_score}")

    # Step 5 — AI explanations (per-marker)
    for b in enriched:
        b["ai_explanation"] = generate_biomarker_explanation(
            b["marker_name"], b["value"], b["unit"], b["risk_category"]
        )

    # Step 6 — AI overall summary & recommendations
    ai_summary = generate_overall_summary(enriched, health_score)
    recommendations = generate_recommendations(enriched)

    # Step 7 — Persist to DB
    update_health_score(report_id, health_score)
    insert_biomarkers(report_id, enriched)
    persist_analysis_metadata(report_id, ai_summary, recommendations)

    return {
        "report_id": report_id,
        "health_score": health_score,
        "biomarkers": enriched,
        "ai_summary": ai_summary,
        "recommendations": recommendations,
    }
