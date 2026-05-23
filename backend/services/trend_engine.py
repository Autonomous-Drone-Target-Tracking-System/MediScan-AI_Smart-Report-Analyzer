"""
trend_engine.py — Biomarker trend analysis and delta computation.

Responsibilities:
  1. Canonicalise biomarker names across reports (handles spelling variants)
  2. Compute per-biomarker time-series from historical report data
  3. Calculate deltas, percentage changes, trend direction, and velocity
  4. Detect anomalies (sudden spikes / drops)
  5. Estimate risk progression (simple linear extrapolation)
  6. Group biomarkers into clinical categories

All functions are pure (no DB access) — they operate on dicts already
fetched by the CRUD layer.
"""

from __future__ import annotations

import math
import statistics
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


# ── Canonical groupings ────────────────────────────────────────────────────────

BIOMARKER_GROUPS: Dict[str, List[str]] = {
    "Blood Sugar":      ["glucose", "blood sugar", "fasting glucose", "blood sugar (fasting)", "hba1c"],
    "Lipids":           ["ldl", "ldl cholesterol", "hdl", "hdl cholesterol", "total cholesterol",
                         "cholesterol", "triglycerides"],
    "Thyroid":          ["tsh"],
    "Kidney":           ["creatinine", "urea", "uric acid"],
    "Liver":            ["alt", "ast", "bilirubin", "alkaline phosphatase"],
    "Blood Count":      ["hemoglobin", "hgb", "hb", "wbc", "rbc", "platelet count", "platelets"],
    "Electrolytes":     ["sodium", "potassium", "calcium"],
    "Vitamins & Iron":  ["vitamin d", "vitamin b12", "ferritin", "iron"],
}

# Reverse lookup: canonical_name_lower → group
_NAME_TO_GROUP: Dict[str, str] = {}
for _grp, _names in BIOMARKER_GROUPS.items():
    for _n in _names:
        _NAME_TO_GROUP[_n] = _grp

# Higher-is-better markers (for direction arrows)
HIGHER_IS_BETTER = {"hdl", "hdl cholesterol", "hemoglobin", "hgb", "hb", "vitamin d",
                    "vitamin b12", "ferritin", "iron", "rbc", "platelet count", "platelets"}

# Name normalisation aliases
_ALIASES: Dict[str, str] = {
    "hgb": "Hemoglobin", "hb": "Hemoglobin", "haemoglobin": "Hemoglobin",
    "ldl": "LDL Cholesterol", "ldl-c": "LDL Cholesterol",
    "hdl": "HDL Cholesterol", "hdl-c": "HDL Cholesterol",
    "cholesterol": "Total Cholesterol", "total cholesterol": "Total Cholesterol",
    "blood sugar": "Blood Sugar (Fasting)", "fasting glucose": "Blood Sugar (Fasting)",
    "glucose": "Blood Sugar (Fasting)", "blood glucose": "Blood Sugar (Fasting)",
    "hba1c": "HbA1c", "glycated haemoglobin": "HbA1c",
    "tsh": "TSH", "thyroid stimulating hormone": "TSH",
    "wbc": "WBC", "white blood cells": "WBC", "white blood count": "WBC",
    "rbc": "RBC", "red blood cells": "RBC",
    "platelets": "Platelet Count", "plt": "Platelet Count",
    "vitamin d": "Vitamin D", "vit d": "Vitamin D", "25-oh vitamin d": "Vitamin D",
    "vitamin b12": "Vitamin B12", "vit b12": "Vitamin B12", "cobalamin": "Vitamin B12",
    "alt": "ALT", "sgpt": "ALT", "alanine aminotransferase": "ALT",
    "ast": "AST", "sgot": "AST", "aspartate aminotransferase": "AST",
    "alp": "Alkaline Phosphatase", "alkaline phosphatase": "Alkaline Phosphatase",
    "bilirubin": "Bilirubin", "total bilirubin": "Bilirubin",
    "creatinine": "Creatinine", "serum creatinine": "Creatinine",
    "urea": "Urea", "blood urea": "Urea", "bun": "Urea",
    "uric acid": "Uric Acid", "serum uric acid": "Uric Acid",
    "sodium": "Sodium", "potassium": "Potassium", "calcium": "Calcium",
    "ferritin": "Ferritin", "iron": "Iron", "serum iron": "Iron",
    "triglycerides": "Triglycerides", "tg": "Triglycerides",
    "hemoglobin": "Hemoglobin",
}

# Reference ranges: name → (low, high)  — None means no bound
_REF_RANGES: Dict[str, Tuple[Optional[float], Optional[float]]] = {
    "Hemoglobin":              (12.0, 17.5),
    "LDL Cholesterol":         (None, 130.0),
    "HDL Cholesterol":         (40.0, None),
    "Total Cholesterol":       (None, 200.0),
    "Blood Sugar (Fasting)":   (70.0, 100.0),
    "HbA1c":                   (None,  5.7),
    "Triglycerides":           (None, 150.0),
    "Creatinine":              (0.6,   1.2),
    "Urea":                    (7.0,  20.0),
    "Uric Acid":               (2.4,   7.0),
    "WBC":                     (4.0,  11.0),
    "RBC":                     (4.2,   5.9),
    "Platelet Count":          (150.0,400.0),
    "Sodium":                  (136.0,145.0),
    "Potassium":               (3.5,   5.1),
    "Calcium":                 (8.6,  10.3),
    "TSH":                     (0.4,   4.0),
    "Vitamin D":               (30.0, 100.0),
    "Vitamin B12":             (200.0,900.0),
    "Ferritin":                (12.0, 300.0),
    "Iron":                    (60.0, 170.0),
    "Bilirubin":               (None,  1.2),
    "ALT":                     (None, 40.0),
    "AST":                     (None, 40.0),
    "Alkaline Phosphatase":    (None,120.0),
}


# ── Name normalisation ────────────────────────────────────────────────────────

def canonical_name(raw: str) -> str:
    """Return the canonical display name for a raw biomarker name."""
    lo = raw.lower().strip()
    if lo in _ALIASES:
        return _ALIASES[lo]
    # Substring match
    for key, display in _ALIASES.items():
        if key in lo:
            return display
    return raw.strip().title()


def get_group(name: str) -> str:
    """Return the clinical group for a canonical biomarker name."""
    lo = name.lower().strip()
    if lo in _NAME_TO_GROUP:
        return _NAME_TO_GROUP[lo]
    for key, grp in _NAME_TO_GROUP.items():
        if key in lo:
            return grp
    return "Other"


def get_reference_range(name: str) -> Tuple[Optional[float], Optional[float]]:
    """Return (low, high) reference range for a canonical name."""
    canon = canonical_name(name)
    return _REF_RANGES.get(canon, (None, None))


# ── Per-biomarker data point ───────────────────────────────────────────────────

class DataPoint:
    """One reading of a biomarker at a specific point in time."""
    __slots__ = ("report_id", "date", "value", "unit", "risk_category")

    def __init__(
        self,
        report_id:     int,
        date:          datetime,
        value:         float,
        unit:          str,
        risk_category: str,
    ):
        self.report_id     = report_id
        self.date          = date
        self.value         = value
        self.unit          = unit
        self.risk_category = risk_category


# ── Core analytics ────────────────────────────────────────────────────────────

def build_time_series(
    biomarker_name: str,
    all_reports:    List[Dict[str, Any]],
    all_biomarkers: List[Dict[str, Any]],
) -> List[DataPoint]:
    """
    Collect all DataPoints for a specific biomarker across all reports.

    all_reports:   list of report dicts (must include report_id, upload_timestamp)
    all_biomarkers: list of biomarker dicts (must include report_id, marker_name,
                    extracted_value, unit, risk_category)

    Returns a chronologically sorted list of DataPoints.
    """
    canon  = canonical_name(biomarker_name)
    report_dates = {}
    for r in all_reports:
        ts_raw = r.get("upload_timestamp", "")
        try:
            dt = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
        except Exception:
            try:
                dt = datetime.strptime(ts_raw[:19], "%Y-%m-%d %H:%M:%S")
            except Exception:
                dt = datetime.now()
        report_dates[r["report_id"]] = dt

    points = []
    for bm in all_biomarkers:
        if canonical_name(bm.get("marker_name", "")) != canon:
            continue
        val = bm.get("extracted_value") or bm.get("value")
        if val is None:
            continue
        try:
            val = float(val)
        except (TypeError, ValueError):
            continue
        rid = bm.get("report_id")
        if rid not in report_dates:
            continue
        points.append(DataPoint(
            report_id     = rid,
            date          = report_dates[rid],
            value         = val,
            unit          = bm.get("unit", ""),
            risk_category = bm.get("risk_category", "Normal"),
        ))

    points.sort(key=lambda p: p.date)
    return points


def compute_delta(points: List[DataPoint]) -> Optional[Dict[str, Any]]:
    """
    Compute change metrics between the first and last data point.

    Returns None if fewer than 2 points exist.
    """
    if len(points) < 2:
        return None

    first, last = points[0], points[-1]
    abs_delta = last.value - first.value
    pct_delta = (abs_delta / first.value * 100) if first.value != 0 else 0.0

    return {
        "absolute_change": round(abs_delta, 3),
        "percent_change":  round(pct_delta, 2),
        "from_value":      first.value,
        "to_value":        last.value,
        "from_date":       first.date.isoformat(),
        "to_date":         last.date.isoformat(),
        "span_days":       (last.date - first.date).days,
    }


def compute_trend_direction(
    points:    List[DataPoint],
    name:      str,
) -> str:
    """
    Return trend direction string:
        'improving' | 'worsening' | 'stable' | 'insufficient_data'

    Uses linear regression slope and the higher-is-better lookup.
    """
    if len(points) < 2:
        return "insufficient_data"

    canon = canonical_name(name)
    higher_is_better = canon.lower() in HIGHER_IS_BETTER

    values = [p.value for p in points]
    n      = len(values)
    xs     = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(values) / n

    # Linear regression slope
    num   = sum((xs[i] - mean_x) * (values[i] - mean_y) for i in range(n))
    denom = sum((xs[i] - mean_x) ** 2 for i in range(n))
    slope = num / denom if denom != 0 else 0

    # Threshold: < 1% of mean change per step → stable
    threshold = abs(mean_y) * 0.01 if mean_y != 0 else 0.1

    if abs(slope) < threshold:
        return "stable"

    going_up = slope > 0
    if higher_is_better:
        return "improving" if going_up else "worsening"
    else:
        return "worsening" if going_up else "improving"


def detect_anomalies(points: List[DataPoint]) -> List[Dict[str, Any]]:
    """
    Flag readings that deviate > 2 standard deviations from the mean
    across all historical readings for that biomarker.

    Returns a list of anomaly dicts.
    """
    if len(points) < 3:
        return []

    values = [p.value for p in points]
    mean   = statistics.mean(values)
    stdev  = statistics.stdev(values)

    if stdev == 0:
        return []

    anomalies = []
    for p in points:
        z = abs(p.value - mean) / stdev
        if z > 2.0:
            anomalies.append({
                "report_id": p.report_id,
                "date":      p.date.isoformat(),
                "value":     p.value,
                "z_score":   round(z, 2),
                "direction": "above" if p.value > mean else "below",
            })
    return anomalies


def predict_next_value(points: List[DataPoint]) -> Optional[Dict[str, Any]]:
    """
    Linear extrapolation to estimate value at next likely check-up
    (default: 90 days from last reading).

    Returns None if fewer than 2 points.
    """
    if len(points) < 2:
        return None

    # Use last 4 points for local trend (more responsive than all-time)
    recent = points[-4:]
    n      = len(recent)
    xs     = list(range(n))
    mean_x = sum(xs) / n
    values = [p.value for p in recent]
    mean_y = sum(values) / n

    num   = sum((xs[i] - mean_x) * (values[i] - mean_y) for i in range(n))
    denom = sum((xs[i] - mean_x) ** 2 for i in range(n))
    slope = num / denom if denom != 0 else 0
    inter = mean_y - slope * mean_x

    predicted = inter + slope * n  # one step ahead
    last_date  = points[-1].date

    return {
        "predicted_value": round(predicted, 3),
        "prediction_date": last_date.strftime("%Y-%m-%d"),  # approximate next visit
        "confidence":      "low" if n < 3 else "medium" if n < 5 else "high",
        "slope_per_reading": round(slope, 4),
    }


def compute_risk_progression(points: List[DataPoint]) -> Dict[str, Any]:
    """
    Compute how the risk category has evolved over readings.
    Returns counts per category and overall trajectory.
    """
    counts: Dict[str, int] = {"Normal": 0, "Moderate": 0, "Critical": 0}
    for p in points:
        counts[p.risk_category] = counts.get(p.risk_category, 0) + 1

    categories_seq = [p.risk_category for p in points]
    trajectory = "stable"
    if len(categories_seq) >= 2:
        risk_order = {"Normal": 0, "Moderate": 1, "Critical": 2}
        last_2 = [risk_order.get(c, 0) for c in categories_seq[-2:]]
        if last_2[1] > last_2[0]:
            trajectory = "worsening"
        elif last_2[1] < last_2[0]:
            trajectory = "improving"

    return {"counts": counts, "trajectory": trajectory, "sequence": categories_seq}


# ── Report-level aggregation ───────────────────────────────────────────────────

def build_full_trend_report(
    all_reports:    List[Dict[str, Any]],
    all_biomarkers: List[Dict[str, Any]],
    date_from:      Optional[str] = None,
    date_to:        Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build a complete trend report for all biomarkers across all reports.

    Filters by date range if provided (ISO date strings "YYYY-MM-DD").

    Returns a dict keyed by canonical biomarker name, each value containing:
        - time_series:   list of {date, value, unit, risk_category, report_id}
        - delta:         change from first to last reading
        - trend:         direction string
        - anomalies:     list of anomalous readings
        - prediction:    extrapolated next value
        - risk_prog:     risk category progression
        - group:         clinical group
        - reference:     (low, high) reference range
    """
    # Filter reports by date range
    df = datetime.fromisoformat(date_from) if date_from else None
    dt = datetime.fromisoformat(date_to)   if date_to   else None

    # Collect unique canonical biomarker names
    unique_names: Dict[str, str] = {}  # raw_name → canonical
    for bm in all_biomarkers:
        raw  = bm.get("marker_name", "")
        canon = canonical_name(raw)
        unique_names[raw] = canon

    # Reverse: canonical → set of raw names
    canon_to_raw: Dict[str, str] = {}
    for raw, canon in unique_names.items():
        canon_to_raw[canon] = raw

    result: Dict[str, Any] = {}

    for canon in set(unique_names.values()):
        pts = build_time_series(canon, all_reports, all_biomarkers)

        # Apply date filters
        if df:
            pts = [p for p in pts if p.date >= df]
        if dt:
            pts = [p for p in pts if p.date <= dt]

        if not pts:
            continue

        rmin, rmax = get_reference_range(canon)

        result[canon] = {
            "time_series": [
                {
                    "report_id":    p.report_id,
                    "date":         p.date.strftime("%Y-%m-%d"),
                    "datetime":     p.date.isoformat(),
                    "value":        p.value,
                    "unit":         p.unit,
                    "risk_category": p.risk_category,
                }
                for p in pts
            ],
            "delta":      compute_delta(pts),
            "trend":      compute_trend_direction(pts, canon),
            "anomalies":  detect_anomalies(pts),
            "prediction": predict_next_value(pts),
            "risk_prog":  compute_risk_progression(pts),
            "group":      get_group(canon),
            "reference":  {"min": rmin, "max": rmax},
            "latest_value": pts[-1].value,
            "latest_unit":  pts[-1].unit,
            "reading_count": len(pts),
        }

    return result


def get_health_score_series(reports: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build time-series of overall health scores across all analysed reports."""
    series = []
    for r in reports:
        score = r.get("overall_health_score")
        if score is None:
            continue
        ts = r.get("upload_timestamp", "")
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            try:
                dt = datetime.strptime(ts[:19], "%Y-%m-%d %H:%M:%S")
            except Exception:
                continue
        series.append({
            "report_id": r["report_id"],
            "date":      dt.strftime("%Y-%m-%d"),
            "score":     score,
        })
    series.sort(key=lambda x: x["date"])
    return series
