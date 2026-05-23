"""
analytics_service.py — High-level analytics orchestration + AI narrative generation.

Builds on trend_engine.py to add:
  - AI natural language trend summaries (via Groq)
  - Cross-report delta narrative
  - Personalised health improvement insights
  - Anomaly explanation
  - Offline fallback rule-based summaries
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

from services.trend_engine import (
    BIOMARKER_GROUPS,
    build_full_trend_report,
    get_health_score_series,
    canonical_name,
)

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
ANALYTICS_MODEL = os.getenv("CHAT_MODEL", "llama-3.3-70b-versatile")

try:
    from groq import Groq
    _client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
    GROQ_AVAILABLE = bool(GROQ_API_KEY and _client)
except Exception as _e:
    logger.warning("Groq init failed: %s", _e)
    _client = None
    GROQ_AVAILABLE = False


# ── AI narrative helpers ───────────────────────────────────────────────────────

def _chat(prompt: str, max_tokens: int = 350) -> str:
    """Call Groq synchronously and return text, or '' on failure."""
    if not GROQ_AVAILABLE or not _client:
        return ""
    try:
        resp = _client.chat.completions.create(
            model=ANALYTICS_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a health analytics assistant. Explain biomarker trends "
                        "in clear, empathetic, non-clinical language. Always recommend "
                        "consulting a doctor for medical decisions. Keep responses concise."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content.strip()
    except Exception as exc:
        logger.error("[Analytics AI] Error: %s", exc)
        return ""


# ── Fallback summaries ────────────────────────────────────────────────────────

def _fallback_trend_summary(trend_data: Dict[str, Any]) -> str:
    """Rule-based overall trend summary when AI is unavailable."""
    worsening  = [n for n, d in trend_data.items() if d.get("trend") == "worsening"]
    improving  = [n for n, d in trend_data.items() if d.get("trend") == "improving"]
    stable     = [n for n, d in trend_data.items() if d.get("trend") == "stable"]
    anomalies  = [n for n, d in trend_data.items() if d.get("anomalies")]

    lines = []
    if improving:
        lines.append(f"✅ Improving: {', '.join(improving[:3])}")
    if worsening:
        lines.append(f"⚠️ Needs attention: {', '.join(worsening[:3])}")
    if stable:
        lines.append(f"📊 Stable: {', '.join(stable[:3])}")
    if anomalies:
        lines.append(f"🔔 Unusual readings detected in: {', '.join(anomalies[:2])}")

    if not lines:
        return "Not enough data to compute trends yet. Upload more reports over time."
    return "\n".join(lines) + "\n\nAlways discuss these trends with your healthcare provider."


def _fallback_marker_insight(name: str, trend: str, delta: Optional[Dict]) -> str:
    """Canned insight for a single biomarker when AI is unavailable."""
    if not delta:
        return f"Only one reading available for {name}. Upload more reports to see trends."
    pct = delta["percent_change"]
    direction_word = "risen" if pct > 0 else "fallen"
    if trend == "improving":
        return f"Your {name} has {direction_word} by {abs(pct):.1f}% — this is a positive trend. Keep up the healthy habits!"
    elif trend == "worsening":
        return f"Your {name} has {direction_word} by {abs(pct):.1f}% — this warrants a conversation with your doctor."
    else:
        return f"Your {name} has remained relatively stable (±{abs(pct):.1f}% change). Continue regular monitoring."


# ── Public API ─────────────────────────────────────────────────────────────────

def build_analytics_payload(
    all_reports:    List[Dict[str, Any]],
    all_biomarkers: List[Dict[str, Any]],
    date_from:      Optional[str] = None,
    date_to:        Optional[str] = None,
    generate_ai:    bool          = True,
) -> Dict[str, Any]:
    """
    Master analytics function.

    Returns a comprehensive payload including:
      - trend_data:          per-biomarker trends (from trend_engine)
      - health_score_series: historical health scores
      - groups:              biomarkers organised by clinical category
      - summary:             AI or rule-based overall narrative
      - insights:            per-marker AI insights (top 5 abnormal)
      - alerts:              anomaly + rapid-change alerts
      - overview_stats:      aggregate statistics
    """
    trend_data     = build_full_trend_report(all_reports, all_biomarkers, date_from, date_to)
    score_series   = get_health_score_series(all_reports)
    total_reports  = len(all_reports)
    total_markers  = len(trend_data)

    # Organise by clinical group
    groups: Dict[str, List[str]] = {}
    for name, data in trend_data.items():
        grp = data.get("group", "Other")
        groups.setdefault(grp, []).append(name)

    # Collect alerts
    alerts: List[Dict[str, Any]] = []

    # Anomaly alerts
    for name, data in trend_data.items():
        for anom in data.get("anomalies", []):
            alerts.append({
                "type":    "anomaly",
                "marker":  name,
                "message": (
                    f"{name} showed an unusual reading of {anom['value']} "
                    f"(z-score: {anom['z_score']}) on {anom['date'][:10]}"
                ),
                "severity": "warning",
                "date": anom["date"][:10],
            })

    # Rapid change alerts (>25% change in last 2 readings)
    for name, data in trend_data.items():
        ts = data.get("time_series", [])
        if len(ts) >= 2:
            prev, last = ts[-2], ts[-1]
            if prev["value"] and prev["value"] != 0:
                rapid_pct = abs((last["value"] - prev["value"]) / prev["value"] * 100)
                if rapid_pct > 25:
                    alerts.append({
                        "type":    "rapid_change",
                        "marker":  name,
                        "message": (
                            f"{name} changed by {rapid_pct:.1f}% between your last "
                            f"two reports ({prev['date']} → {last['date']})"
                        ),
                        "severity": "critical" if rapid_pct > 50 else "warning",
                        "date": last["date"],
                    })

    # Overview stats
    worsening_count = sum(1 for d in trend_data.values() if d.get("trend") == "worsening")
    improving_count = sum(1 for d in trend_data.values() if d.get("trend") == "improving")
    stable_count    = sum(1 for d in trend_data.values() if d.get("trend") == "stable")
    latest_score    = score_series[-1]["score"] if score_series else None
    score_delta     = (
        score_series[-1]["score"] - score_series[0]["score"]
        if len(score_series) >= 2 else None
    )

    overview_stats = {
        "total_reports":    total_reports,
        "total_markers":    total_markers,
        "worsening_count":  worsening_count,
        "improving_count":  improving_count,
        "stable_count":     stable_count,
        "alert_count":      len(alerts),
        "latest_score":     latest_score,
        "score_delta":      score_delta,
    }

    # AI overall summary
    ai_summary = ""
    if generate_ai and GROQ_AVAILABLE and trend_data:
        improving  = [n for n, d in trend_data.items() if d["trend"] == "improving"][:4]
        worsening  = [n for n, d in trend_data.items() if d["trend"] == "worsening"][:4]
        anomaly_ms = [n for n, d in trend_data.items() if d.get("anomalies")][:3]

        prompt = (
            f"A patient has uploaded {total_reports} medical reports over time. "
            f"Summary of biomarker trends:\n"
            f"- Improving markers: {', '.join(improving) or 'None'}\n"
            f"- Worsening markers: {', '.join(worsening) or 'None'}\n"
            f"- Unusual readings: {', '.join(anomaly_ms) or 'None'}\n"
            f"- Health score: {latest_score}/100"
            + (f" (change: {score_delta:+d} points)" if score_delta is not None else "") + "\n\n"
            "Write a 3-4 sentence plain-English health trend summary. "
            "Be empathetic, highlight what needs attention first, and close with "
            "a recommendation to consult their doctor."
        )
        ai_summary = _chat(prompt, max_tokens=250)

    if not ai_summary:
        ai_summary = _fallback_trend_summary(trend_data)

    # AI per-marker insights (for top worsening / anomalous markers only)
    insights: Dict[str, str] = {}
    priority_markers = (
        [n for n, d in trend_data.items() if d["trend"] == "worsening"][:3]
        + [n for n, d in trend_data.items() if d.get("anomalies")][:2]
    )
    priority_markers = list(dict.fromkeys(priority_markers))[:5]  # dedup

    for name in priority_markers:
        data  = trend_data[name]
        delta = data.get("delta")
        trend = data.get("trend", "stable")
        ts    = data.get("time_series", [])

        if generate_ai and GROQ_AVAILABLE and delta:
            pct  = delta["percent_change"]
            vals = [f"{p['value']} ({p['date']})" for p in ts[-3:]]
            prompt = (
                f"Patient's {name} readings (recent first): {', '.join(reversed(vals))}.\n"
                f"Overall change: {pct:+.1f}% ({trend} trend).\n"
                f"Reference range: {data['reference']}.\n"
                "In 2-3 concise sentences: explain what this trend means for the patient, "
                "possible lifestyle causes, and what they should discuss with their doctor. "
                "Do not diagnose."
            )
            insights[name] = _chat(prompt, max_tokens=180)

        if not insights.get(name):
            insights[name] = _fallback_marker_insight(name, trend, delta)

    return {
        "trend_data":         trend_data,
        "health_score_series": score_series,
        "groups":             groups,
        "alerts":             sorted(alerts, key=lambda a: a.get("date", ""), reverse=True),
        "ai_summary":         ai_summary,
        "insights":           insights,
        "overview_stats":     overview_stats,
        "date_filter":        {"from": date_from, "to": date_to},
    }
