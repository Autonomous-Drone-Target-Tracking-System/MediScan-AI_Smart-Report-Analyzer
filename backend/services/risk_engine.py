"""
Rule-based risk classification engine and health score calculator.
"""

from typing import List, Dict, Any


def classify_risk(value: float, ref_low, ref_high) -> str:
    """
    Returns 'Normal', 'Moderate', or 'Critical' based on deviation from range.

    Moderate  → 10–25% outside range
    Critical  → >25% outside range or completely absent bound exceeded
    """
    if ref_low is not None and value < ref_low:
        deviation = (ref_low - value) / ref_low
        if deviation > 0.25:
            return "Critical"
        elif deviation > 0.10:
            return "Moderate"
        else:
            return "Normal"

    if ref_high is not None and value > ref_high:
        deviation = (value - ref_high) / ref_high
        if deviation > 0.25:
            return "Critical"
        elif deviation > 0.10:
            return "Moderate"
        else:
            return "Normal"

    return "Normal"


def enrich_biomarkers(parsed: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add risk_category to each parsed biomarker dict."""
    for b in parsed:
        b["risk_category"] = classify_risk(
            b["value"], b.get("ref_low"), b.get("ref_high")
        )
    return parsed


def calculate_health_score(biomarkers: List[Dict[str, Any]]) -> int:
    """
    Start at 100. Deduct:
      - 15 points per Critical finding
      -  7 points per Moderate finding
    Minimum score: 0
    """
    score = 100
    for b in biomarkers:
        risk = b.get("risk_category", "Normal")
        if risk == "Critical":
            score -= 15
        elif risk == "Moderate":
            score -= 7
    return max(0, score)
