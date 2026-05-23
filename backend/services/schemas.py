"""
schemas.py — Pydantic models for structured LLM biomarker extraction.

These models serve THREE purposes:
  1. Define the exact JSON shape the LLM must produce (used in the system prompt).
  2. Validate and coerce the LLM's raw output at parse-time.
  3. Provide typed structures consumed by downstream pipeline stages.

Design principles:
  - Every field has a sensible default so partial LLM outputs don't hard-crash.
  - Validators normalise free-form strings (e.g. "NORMAL", "N/A", "") into
    canonical values accepted by the rest of the pipeline.
  - The models are intentionally flat to minimise LLM hallucination surface.
"""

from __future__ import annotations

import re
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ── Enumerations ──────────────────────────────────────────────────────────────

class BiomarkerStatus(str, Enum):
    """
    Canonical status string for a biomarker reading.
    Maps loosely to the risk_engine's Normal / Moderate / Critical categories.
    """
    NORMAL   = "Normal"
    LOW      = "Low"
    HIGH     = "High"
    CRITICAL = "Critical"
    UNKNOWN  = "Unknown"


# ── Patient info ──────────────────────────────────────────────────────────────

class PatientInfo(BaseModel):
    """Demographic fields extracted from report header / footer."""

    name:   str = Field(default="Unknown", description="Full patient name as printed on the report")
    age:    str = Field(default="Unknown", description="Age, e.g. '45' or '45Y'")
    gender: str = Field(default="Unknown", description="Gender as printed, e.g. 'Male', 'Female', 'M', 'F'")

    @field_validator("name", "age", "gender", mode="before")
    @classmethod
    def coerce_empty_to_unknown(cls, v: object) -> str:
        """Replace None / empty / whitespace with 'Unknown'."""
        if v is None or str(v).strip() in {"", "N/A", "n/a", "NA", "-", "—"}:
            return "Unknown"
        return str(v).strip()

    @field_validator("gender", mode="after")
    @classmethod
    def normalise_gender(cls, v: str) -> str:
        """Map single-letter codes to full words."""
        mapping = {"m": "Male", "f": "Female", "male": "Male", "female": "Female"}
        return mapping.get(v.lower(), v)


# ── Individual biomarker ───────────────────────────────────────────────────────

class BiomarkerExtraction(BaseModel):
    """
    A single biomarker line extracted from the OCR text.

    Fields mirror the canonical output schema requested in the task spec.
    reference_min / reference_max default to -1 to signal "not present" without
    using None (which causes serialisation headaches with some LLM outputs).
    """

    name:          str   = Field(...,    description="Normalised biomarker name, e.g. 'Hemoglobin'")
    value:         float = Field(...,    description="Numeric reading extracted from the report")
    unit:          str   = Field(default="", description="Unit string, e.g. 'g/dL', 'mg/dL'")
    reference_min: float = Field(default=-1, description="Lower bound of reference range; -1 = absent")
    reference_max: float = Field(default=-1, description="Upper bound of reference range; -1 = absent")
    status:        str   = Field(default=BiomarkerStatus.UNKNOWN, description="Normal | Low | High | Critical | Unknown")

    # ── Field validators ──────────────────────────────────────────────────────

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: object) -> str:
        if not v or str(v).strip() == "":
            raise ValueError("Biomarker name must not be empty")
        # Remove stray digits / punctuation that the OCR may have attached to the name
        cleaned = re.sub(r"[^A-Za-z0-9\s\(\)\-/]", "", str(v)).strip()
        return cleaned if cleaned else str(v).strip()

    @field_validator("value", mode="before")
    @classmethod
    def coerce_value(cls, v: object) -> float:
        """Accept numeric strings, strip non-numeric chars, then cast."""
        if isinstance(v, (int, float)):
            return float(v)
        cleaned = re.sub(r"[^\d.\-]", "", str(v))
        try:
            return float(cleaned)
        except ValueError:
            raise ValueError(f"Cannot parse numeric value from: {v!r}")

    @field_validator("unit", mode="before")
    @classmethod
    def clean_unit(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v).strip()

    @field_validator("reference_min", "reference_max", mode="before")
    @classmethod
    def coerce_ref(cls, v: object) -> float:
        """Convert None / empty / '-' to the sentinel -1."""
        if v is None or str(v).strip() in {"", "N/A", "n/a", "NA", "-", "—", "null"}:
            return -1.0
        try:
            return float(str(v).strip())
        except ValueError:
            return -1.0

    @field_validator("status", mode="before")
    @classmethod
    def normalise_status(cls, v: object) -> str:
        """Map free-form LLM status strings to canonical BiomarkerStatus values."""
        if v is None:
            return BiomarkerStatus.UNKNOWN
        mapping = {
            "normal":   BiomarkerStatus.NORMAL,
            "low":      BiomarkerStatus.LOW,
            "high":     BiomarkerStatus.HIGH,
            "critical": BiomarkerStatus.CRITICAL,
            "elevated": BiomarkerStatus.HIGH,
            "reduced":  BiomarkerStatus.LOW,
            "abnormal": BiomarkerStatus.HIGH,
            "unknown":  BiomarkerStatus.UNKNOWN,
            "n/a":      BiomarkerStatus.UNKNOWN,
        }
        return mapping.get(str(v).lower().strip(), BiomarkerStatus.UNKNOWN)

    # ── Model-level cross-field validation ────────────────────────────────────

    @model_validator(mode="after")
    def check_reference_range_sanity(self) -> "BiomarkerExtraction":
        """
        Sanity-check: if both bounds are present (>= 0), min must be ≤ max.
        If inverted, swap them rather than discarding the reading entirely.
        """
        rmin, rmax = self.reference_min, self.reference_max
        if rmin >= 0 and rmax >= 0 and rmin > rmax:
            # Silently swap — LLM sometimes reverses the columns
            self.reference_min, self.reference_max = rmax, rmin
        return self


# ── Top-level extraction result ────────────────────────────────────────────────

class ExtractionResult(BaseModel):
    """
    Complete structured output from the LLM extraction pass.

    This is what the LLM is instructed to produce and what we validate
    before handing the data to the risk engine.
    """

    patient_info: PatientInfo              = Field(default_factory=PatientInfo)
    biomarkers:   List[BiomarkerExtraction] = Field(default_factory=list)

    @model_validator(mode="after")
    def deduplicate_biomarkers(self) -> "ExtractionResult":
        """
        Merge duplicate biomarker entries (same canonical name).

        Strategy: keep the first occurrence but update reference range and status
        if the duplicate has more complete data.
        """
        seen: dict[str, int] = {}   # canonical_name → index in result list
        merged: list[BiomarkerExtraction] = []

        for bm in self.biomarkers:
            canon = bm.name.lower().strip()
            if canon in seen:
                # Existing entry — upgrade reference ranges if currently absent
                existing = merged[seen[canon]]
                if existing.reference_min < 0 and bm.reference_min >= 0:
                    existing.reference_min = bm.reference_min
                if existing.reference_max < 0 and bm.reference_max >= 0:
                    existing.reference_max = bm.reference_max
                # Upgrade status from Unknown if duplicate has a real status
                if existing.status == BiomarkerStatus.UNKNOWN and bm.status != BiomarkerStatus.UNKNOWN:
                    existing.status = bm.status
            else:
                seen[canon] = len(merged)
                merged.append(bm)

        self.biomarkers = merged
        return self


# ── Confidence scoring payload ────────────────────────────────────────────────

class ExtractionConfidence(BaseModel):
    """
    Confidence metadata attached to each ExtractionResult by the
    confidence engine.  Not produced by the LLM — computed deterministically.
    """

    overall_score:       float = Field(..., ge=0.0, le=1.0, description="0-1 overall confidence")
    patient_info_score:  float = Field(..., ge=0.0, le=1.0)
    biomarker_score:     float = Field(..., ge=0.0, le=1.0)
    biomarker_count:     int   = Field(..., ge=0)
    unknown_count:       int   = Field(default=0, description="Biomarkers with Unknown status")
    missing_refs_count:  int   = Field(default=0, description="Biomarkers missing reference ranges")
    warnings:            List[str] = Field(default_factory=list)
    used_fallback:       bool  = Field(default=False, description="True if regex fallback was used")
    retry_count:         int   = Field(default=0, description="Number of LLM retries needed")
