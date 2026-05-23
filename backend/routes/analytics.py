"""
routes/analytics.py — Upgraded, HIPAA-compliant Analytics API endpoints.

Enforces:
  1. require_hipaa_consent dependency.
  2. Owner-validation of all queried reports and data points.
  3. Records audit log events for all analytics views.
"""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Depends, Request

from db.database import get_connection
from db.crud import get_biomarkers_by_report_id, get_report_by_id
from services.analytics_service import build_analytics_payload
from services.trend_engine import (
    build_full_trend_report,
    build_time_series,
    get_health_score_series,
    canonical_name,
    get_group,
    get_reference_range,
    compute_delta,
    compute_trend_direction,
    detect_anomalies,
    predict_next_value,
    compute_risk_progression,
)
from services.security_deps import require_hipaa_consent
from services.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Secure Helpers ────────────────────────────────────────────────────────────

def _load_user_reports(user_id: int):
    """Retrieve reports strictly belonging to the currently authenticated user."""
    conn = get_connection()
    cur = conn.cursor()
    rows = cur.execute(
        """SELECT * FROM reports
           WHERE user_id = ?
           ORDER BY report_id DESC
           LIMIT 200""",
        (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _load_all_biomarkers(reports):
    """Load all biomarkers associated with the user's filtered reports list."""
    biomarkers = []
    for r in reports:
        biomarkers.extend(get_biomarkers_by_report_id(r["report_id"]))
    return biomarkers


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/analytics/trends")
async def get_trends(
    request: Request,
    date_from:   Optional[str] = Query(None, description="Filter from date YYYY-MM-DD"),
    date_to:     Optional[str] = Query(None, description="Filter to date YYYY-MM-DD"),
    generate_ai: bool          = Query(True,  description="Generate AI narrative summaries"),
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    Returns secure longitudinal analytics payload for the authenticated owner only.
    Prevents cross-patient demographics and history leaks.
    """
    user_id = current_user["user_id"]
    ip = request.client.host if request.client else "127.0.0.1"

    reports = _load_user_reports(user_id)
    if not reports:
        raise HTTPException(status_code=404, detail="No clinical reports found. Please upload a report first.")

    biomarkers = _load_all_biomarkers(reports)

    log_audit(
        action="VIEW_PHI_ANALYTICS",
        user_id=user_id,
        ip_address=ip,
        status="SUCCESS",
        details="Authorized view of overall wellness trends."
    )

    payload = build_analytics_payload(
        all_reports    = reports,
        all_biomarkers = biomarkers,
        date_from      = date_from,
        date_to        = date_to,
        generate_ai    = generate_ai,
    )
    return payload


@router.get("/analytics/biomarker/{marker_name}")
async def get_single_biomarker_trend(
    marker_name: str,
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """Returns secure trend timeline for a single named biomarker."""
    user_id = current_user["user_id"]
    ip = request.client.host if request.client else "127.0.0.1"

    reports = _load_user_reports(user_id)
    if not reports:
        raise HTTPException(status_code=404, detail="No reports available.")

    biomarkers = _load_all_biomarkers(reports)

    canon = canonical_name(marker_name)
    pts   = build_time_series(canon, reports, biomarkers)

    if not pts:
        raise HTTPException(
            status_code=404,
            detail=f"No clinical readings found for biomarker '{marker_name}'."
        )

    ref_min, ref_max = get_reference_range(canon)

    log_audit(
        action="VIEW_PHI_BIOMARKER_ANALYTICS",
        user_id=user_id,
        ip_address=ip,
        resource_id=canon,
        status="SUCCESS",
        details=f"Viewed historical trajectory for marker: {canon}"
    )

    return {
        "name":         canon,
        "group":        get_group(canon),
        "reference":    {"min": ref_min, "max": ref_max},
        "time_series":  [
            {
                "report_id":     p.report_id,
                "date":          p.date.strftime("%Y-%m-%d"),
                "value":         p.value,
                "unit":          p.unit,
                "risk_category": p.risk_category,
            }
            for p in pts
        ],
        "delta":         compute_delta(pts),
        "trend":         compute_trend_direction(pts, canon),
        "anomalies":     detect_anomalies(pts),
        "prediction":    predict_next_value(pts),
        "risk_progression": compute_risk_progression(pts),
        "reading_count": len(pts),
    }


@router.get("/analytics/health-score")
async def get_health_score_history(
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """Returns the authenticated user's secure health score time-series."""
    user_id = current_user["user_id"]
    ip = request.client.host if request.client else "127.0.0.1"

    reports = _load_user_reports(user_id)
    series  = get_health_score_series(reports)
    if not series:
        raise HTTPException(status_code=404, detail="No health scores available yet.")

    log_audit(
        action="VIEW_PHI_HEALTH_SCORE",
        user_id=user_id,
        ip_address=ip,
        status="SUCCESS",
        details="Authorized view of health score timelines."
    )

    delta = None
    if len(series) >= 2:
        delta = {
            "change":    series[-1]["score"] - series[0]["score"],
            "from":      series[0]["score"],
            "to":        series[-1]["score"],
            "from_date": series[0]["date"],
            "to_date":   series[-1]["date"],
        }

    return {"series": series, "delta": delta, "total_reports": len(series)}


@router.get("/analytics/alerts")
async def get_alerts(
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """Returns active anomaly and velocity alerts for the authenticated owner."""
    user_id = current_user["user_id"]
    ip = request.client.host if request.client else "127.0.0.1"

    reports = _load_user_reports(user_id)
    if not reports:
        return {"alerts": [], "alert_count": 0}

    biomarkers = _load_all_biomarkers(reports)

    log_audit(
        action="VIEW_PHI_ALERTS",
        user_id=user_id,
        ip_address=ip,
        status="SUCCESS",
        details="Authorized view of system critical alerts."
    )

    payload = build_analytics_payload(
        all_reports    = reports,
        all_biomarkers = biomarkers,
        generate_ai    = False,
    )
    return {
        "alerts":      payload["alerts"],
        "alert_count": len(payload["alerts"]),
    }


@router.get("/analytics/compare")
async def compare_reports(
    a: int = Query(..., description="First report ID"),
    b: int = Query(..., description="Second report ID"),
    request: Request = None,
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    Side-by-side comparison. Restricts analysis strictly to reports owned
    by the active user, preventing cross-tenant document comparisons.
    """
    user_id = current_user["user_id"]
    role = current_user["role"]
    ip = request.client.host if request and request.client else "127.0.0.1"

    report_a = get_report_by_id(a)
    report_b = get_report_by_id(b)

    if not report_a or not report_b:
        raise HTTPException(status_code=404, detail="One or both comparison reports not found.")

    # Authorization Check: User must own both reports (RBAC)
    if (report_a["user_id"] != user_id or report_b["user_id"] != user_id) and role not in ("doctor", "admin"):
        log_audit(
            action="ACCESS_DENIED",
            user_id=user_id,
            ip_address=ip,
            resource_id=f"{a}_vs_{b}",
            status="UNAUTHORIZED",
            details="RBAC: User attempted to compare reports belonging to another patient."
        )
        raise HTTPException(
            status_code=403,
            detail="RBAC Enforcement: You are not authorized to compare these clinical records."
        )

    log_audit(
        action="COMPARE_PHI_REPORTS",
        user_id=user_id,
        ip_address=ip,
        resource_id=f"{a}_vs_{b}",
        status="SUCCESS",
        details="Authorized side-by-side clinical record compare."
    )

    bm_a = {canonical_name(bm["marker_name"]): bm for bm in get_biomarkers_by_report_id(a)}
    bm_b = {canonical_name(bm["marker_name"]): bm for bm in get_biomarkers_by_report_id(b)}

    all_names = set(bm_a) | set(bm_b)
    deltas = []

    for name in sorted(all_names):
        val_a = bm_a[name]["extracted_value"] if name in bm_a else None
        val_b = bm_b[name]["extracted_value"] if name in bm_b else None
        unit  = (bm_a.get(name) or bm_b.get(name) or {}).get("unit", "")
        risk_a = bm_a[name]["risk_category"] if name in bm_a else None
        risk_b = bm_b[name]["risk_category"] if name in bm_b else None

        abs_change = None
        pct_change = None
        if val_a is not None and val_b is not None and val_a != 0:
            abs_change = round(val_b - val_a, 3)
            pct_change = round((val_b - val_a) / val_a * 100, 2)

        ref_min, ref_max = get_reference_range(name)

        deltas.append({
            "name":         name,
            "group":        get_group(name),
            "unit":         unit,
            "value_a":      val_a,
            "value_b":      val_b,
            "risk_a":       risk_a,
            "risk_b":       risk_b,
            "abs_change":   abs_change,
            "pct_change":   pct_change,
            "reference":    {"min": ref_min, "max": ref_max},
            "only_in_a":    name in bm_a and name not in bm_b,
            "only_in_b":    name not in bm_a and name in bm_b,
        })

    score_a = report_a.get("overall_health_score")
    score_b = report_b.get("overall_health_score")

    return {
        "report_a": {"report_id": a, "date": report_a.get("upload_timestamp", "")[:10], "score": score_a},
        "report_b": {"report_id": b, "date": report_b.get("upload_timestamp", "")[:10], "score": score_b},
        "score_delta": (score_b - score_a) if score_a and score_b else None,
        "biomarker_deltas": deltas,
        "total_shared": sum(1 for d in deltas if d["value_a"] and d["value_b"]),
    }
