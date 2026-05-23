"""
Analysis endpoints:
  POST /api/analyze/{report_id}  → runs full pipeline
  GET  /api/report/{report_id}   → returns stored result
"""

import os
import json
from fastapi import APIRouter, HTTPException

from db.crud import get_report_by_id, get_biomarkers_by_report_id, get_all_reports
from models.schemas import AnalysisResult, BiomarkerOut
from services.pipeline import run_analysis

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")


@router.get("/reports")
async def list_reports():
    """Return a summary list of all past reports for the History page."""
    reports = get_all_reports(limit=50)
    # Determine if each report has been analyzed (has biomarkers or health_score < 100 set explicitly)
    result = []
    for r in reports:
        analyzed = r.get("ai_summary") is not None
        result.append({
            "report_id": r["report_id"],
            "upload_timestamp": r["upload_timestamp"],
            "document_url": r["document_url"],
            "overall_health_score": r["overall_health_score"],
            "analyzed": analyzed,
        })
    return {"reports": result}



@router.post("/analyze/{report_id}", response_model=AnalysisResult)
async def analyze_report(report_id: int):
    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found.")

    # Resolve absolute path from stored document_url (/uploads/filename.pdf)
    filename = os.path.basename(report["document_url"])
    file_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Uploaded file not found on server.")

    result = run_analysis(file_path, report_id)

    return AnalysisResult(
        report_id=result["report_id"],
        health_score=result["health_score"],
        biomarkers=[BiomarkerOut(**_to_out(b)) for b in result["biomarkers"]],
        ai_summary=result["ai_summary"],
        recommendations=result["recommendations"],
    )


@router.get("/report/{report_id}", response_model=AnalysisResult)
async def get_report(report_id: int):
    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found.")

    biomarkers = get_biomarkers_by_report_id(report_id)

    if not biomarkers:
        raise HTTPException(
            status_code=404,
            detail="No analysis results found. Please run /api/analyze/{report_id} first.",
        )

    # Deserialise stored recommendations (JSON list) or fall back gracefully
    raw_recs = report.get("recommendations")
    try:
        recommendations = json.loads(raw_recs) if raw_recs else ["Consult your doctor for personalized advice."]
    except Exception:
        recommendations = [raw_recs] if raw_recs else ["Consult your doctor for personalized advice."]

    ai_summary = report.get("ai_summary") or "Report analysis complete. See biomarkers below."

    return AnalysisResult(
        report_id=report_id,
        health_score=report["overall_health_score"] if report["overall_health_score"] is not None else 100,
        biomarkers=[BiomarkerOut(**_to_out(b)) for b in biomarkers],
        ai_summary=ai_summary,
        recommendations=recommendations,
    )


def _to_out(b: dict) -> dict:
    # For biomarkers loaded from the DB, ref_low / ref_high may be missing.
    # Fall back to the canonical REFERENCE_RANGES lookup in that case.
    ref_low = b.get("ref_low")
    ref_high = b.get("ref_high")

    if ref_low is None and ref_high is None:
        from services.medical_parser import REFERENCE_RANGES
        key = b.get("marker_name", "").lower().strip()
        for rk, rv in REFERENCE_RANGES.items():
            if rk in key or key in rk:
                ref_low = rv.get("low")
                ref_high = rv.get("high")
                break

    return {
        "marker_id": b.get("marker_id"),
        "marker_name": b.get("marker_name", ""),
        "extracted_value": b.get("value") or b.get("extracted_value"),
        "unit": b.get("unit", ""),
        "risk_category": b.get("risk_category", "Normal"),
        "ai_explanation": b.get("ai_explanation", ""),
        "ref_low": ref_low,
        "ref_high": ref_high,
    }
