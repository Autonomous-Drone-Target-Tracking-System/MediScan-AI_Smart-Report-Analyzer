"""
models/schemas.py — Pydantic response models for the FastAPI layer.

These models define what the API returns to the frontend.
They are separate from services/schemas.py (which defines the LLM extraction
intermediate types) so that internal representation changes don't break the
public API contract.
"""

from pydantic import BaseModel
from typing import List, Optional


class BiomarkerOut(BaseModel):
    """A single biomarker in the API response."""
    marker_id:       Optional[int]   = None
    marker_name:     str
    extracted_value: Optional[float] = None
    unit:            Optional[str]   = None
    risk_category:   str             = "Normal"
    ai_explanation:  Optional[str]   = None
    # Reference range bounds — surfaced to the frontend for sparklines / gauges
    ref_low:         Optional[float] = None
    ref_high:        Optional[float] = None


class PatientInfoOut(BaseModel):
    """Demographic data extracted by the LLM."""
    name:   str = "Unknown"
    age:    str = "Unknown"
    gender: str = "Unknown"


class ExtractionConfidenceOut(BaseModel):
    """Confidence metadata about the extraction pass."""
    overall_score:   float
    biomarker_count: int
    used_fallback:   bool
    confidence_level: str      # "High" | "Medium" | "Low"
    warnings:        List[str] = []


class AnalysisResult(BaseModel):
    """Full analysis result returned by POST /api/analyze/{report_id}."""
    report_id:              int
    health_score:           int
    biomarkers:             List[BiomarkerOut]
    ai_summary:             str
    recommendations:        List[str]
    patient_info:           PatientInfoOut          = PatientInfoOut()
    extraction_confidence:  Optional[ExtractionConfidenceOut] = None


class UploadResponse(BaseModel):
    """Response after a successful file upload."""
    report_id:    int
    document_url: str
    message:      str
