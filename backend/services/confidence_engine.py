"""
confidence_engine.py — Deterministic confidence scoring for extracted biomarkers.

The confidence score is a 0-1 float that quantifies how much we trust the
extraction result.  It is computed AFTER validation so corrections are already
applied.

Scoring model (weighted sum of sub-scores):
  ┌─────────────────────────────────┬────────┐
  │ Dimension                       │ Weight │
  ├─────────────────────────────────┼────────┤
  │ Patient info completeness       │  0.15  │
  │ Biomarker count (coverage)      │  0.20  │
  │ Reference range completeness    │  0.25  │
  │ Status determination rate       │  0.25  │
  │ Validation penalties (warnings) │  0.15  │
  └─────────────────────────────────┴────────┘

A score ≥ 0.75 → high confidence (LLM result accepted as-is).
A score 0.40-0.74 → medium confidence (result used but flagged).
A score < 0.40 → low confidence (fallback parser result preferred).
"""

from __future__ import annotations

import logging
from typing import List

from services.schemas import BiomarkerStatus, ExtractionConfidence, ExtractionResult
from services.validator import ValidatorReport

logger = logging.getLogger(__name__)

# ── Thresholds ────────────────────────────────────────────────────────────────
HIGH_CONFIDENCE   = 0.75
MEDIUM_CONFIDENCE = 0.40

# Penalise heavily per discarded biomarker (OCR noise or hallucination)
DISCARD_PENALTY   = 0.05
# Penalise lightly per warning
WARNING_PENALTY   = 0.02
# Maximum expected biomarkers in a typical panel — used to cap coverage score
TYPICAL_BIOMARKER_COUNT = 15


def _patient_info_score(result: ExtractionResult) -> float:
    """
    Proportion of patient info fields that are not 'Unknown'.
    Each known field contributes 1/3 to the sub-score.
    """
    info = result.patient_info
    known = sum([
        info.name   != "Unknown",
        info.age    != "Unknown",
        info.gender != "Unknown",
    ])
    return known / 3.0


def _biomarker_count_score(count: int) -> float:
    """
    Sigmoidal-ish score based on how many biomarkers were extracted.
    0 → 0.0
    TYPICAL_BIOMARKER_COUNT or more → 1.0
    """
    if count == 0:
        return 0.0
    return min(1.0, count / TYPICAL_BIOMARKER_COUNT)


def _reference_range_score(biomarkers: list) -> float:
    """
    Fraction of biomarkers that have at least one reference bound filled in.
    """
    if not biomarkers:
        return 0.0
    with_refs = sum(
        1 for bm in biomarkers
        if bm.reference_min >= 0 or bm.reference_max >= 0
    )
    return with_refs / len(biomarkers)


def _status_determination_score(biomarkers: list) -> float:
    """
    Fraction of biomarkers whose status is NOT Unknown.
    """
    if not biomarkers:
        return 0.0
    known = sum(1 for bm in biomarkers if bm.status != BiomarkerStatus.UNKNOWN)
    return known / len(biomarkers)


def _validation_penalty(vreport: ValidatorReport) -> float:
    """
    Compute a cumulative penalty from warnings and discarded markers.
    Returns a value in [0, 1] where 0 = no penalty.
    """
    penalty = (
        len(vreport.discarded) * DISCARD_PENALTY
        + len(vreport.warnings) * WARNING_PENALTY
    )
    return min(1.0, penalty)


# ── Public API ─────────────────────────────────────────────────────────────────

def compute_confidence(
    result:      ExtractionResult,
    vreport:     ValidatorReport,
    retry_count: int = 0,
    used_fallback: bool = False,
) -> ExtractionConfidence:
    """
    Compute a full ExtractionConfidence payload for an extraction result.

    Args:
        result:       Validated ExtractionResult from the LLM or fallback.
        vreport:      ValidatorReport produced by validator.py.
        retry_count:  Number of LLM retry attempts consumed.
        used_fallback: True if the regex fallback was used instead of the LLM.

    Returns:
        ExtractionConfidence with all sub-scores and warnings.
    """
    biomarkers = result.biomarkers

    # ── Sub-scores ────────────────────────────────────────────────────────────
    pi_score    = _patient_info_score(result)
    bm_count    = len(biomarkers)
    count_score = _biomarker_count_score(bm_count)
    ref_score   = _reference_range_score(biomarkers)
    status_score = _status_determination_score(biomarkers)
    penalty     = _validation_penalty(vreport)

    # ── Weighted aggregate ────────────────────────────────────────────────────
    raw_score = (
        0.15 * pi_score
        + 0.20 * count_score
        + 0.25 * ref_score
        + 0.25 * status_score
        + 0.15 * (1.0 - penalty)        # validation health
    )

    # Penalise extra retry attempts (each retry suggests the LLM struggled)
    retry_penalty = min(0.10, retry_count * 0.03)
    raw_score = max(0.0, raw_score - retry_penalty)

    # Fallback parser gets a small baseline penalty — it's less complete
    if used_fallback:
        raw_score = max(0.0, raw_score - 0.10)

    overall = round(raw_score, 4)

    # ── Collate warnings for upstream consumers ───────────────────────────────
    confidence_warnings: List[str] = list(vreport.warnings)

    if overall < MEDIUM_CONFIDENCE:
        confidence_warnings.append(
            f"Low confidence ({overall:.2f}) — result may be incomplete or noisy"
        )
    elif overall < HIGH_CONFIDENCE:
        confidence_warnings.append(
            f"Medium confidence ({overall:.2f}) — manual review recommended"
        )

    if used_fallback:
        confidence_warnings.append(
            "Regex fallback parser was used — LLM extraction failed or was unavailable"
        )

    unknown_count = sum(
        1 for bm in biomarkers if bm.status == BiomarkerStatus.UNKNOWN
    )
    missing_refs = sum(
        1 for bm in biomarkers
        if bm.reference_min < 0 and bm.reference_max < 0
    )

    logger.info(
        "Confidence: overall=%.3f pi=%.2f count=%.2f refs=%.2f status=%.2f "
        "penalty=%.2f retries=%d fallback=%s",
        overall, pi_score, count_score, ref_score, status_score,
        penalty, retry_count, used_fallback,
    )

    return ExtractionConfidence(
        overall_score       = overall,
        patient_info_score  = round(pi_score, 4),
        biomarker_score     = round((count_score + ref_score + status_score) / 3, 4),
        biomarker_count     = bm_count,
        unknown_count       = unknown_count,
        missing_refs_count  = missing_refs,
        warnings            = confidence_warnings,
        used_fallback       = used_fallback,
        retry_count         = retry_count,
    )


def confidence_level(score: float) -> str:
    """Human-readable confidence tier."""
    if score >= HIGH_CONFIDENCE:
        return "High"
    elif score >= MEDIUM_CONFIDENCE:
        return "Medium"
    return "Low"
