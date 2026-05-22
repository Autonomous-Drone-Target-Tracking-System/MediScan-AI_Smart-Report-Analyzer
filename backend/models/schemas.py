from pydantic import BaseModel
from typing import List, Optional


class BiomarkerOut(BaseModel):
    marker_id: Optional[int] = None
    marker_name: str
    extracted_value: Optional[float] = None
    unit: Optional[str] = None
    risk_category: str = "Normal"
    ai_explanation: Optional[str] = None


class AnalysisResult(BaseModel):
    report_id: int
    health_score: int
    biomarkers: List[BiomarkerOut]
    ai_summary: str
    recommendations: List[str]


class UploadResponse(BaseModel):
    report_id: int
    document_url: str
    message: str
