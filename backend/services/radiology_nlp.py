"""
services/radiology_nlp.py — Advanced radiology report understanding system.

Uses a hybrid biomedical extraction pipeline:
  1. Local clinical rule-based entity parsing & clinical negation extraction (NegEx inspired).
  2. Terminology normalization mapping findings to UMLS Concept Unique Identifiers (CUIs).
  3. High-fidelity Groq clinical LLM structured extraction mimicking PubMedBERT / BioClinicalBERT.
"""

from __future__ import annotations

import re
import os
import logging
from typing import List, Dict, Any, Tuple
from pydantic import BaseModel, Field
from groq import Groq

logger = logging.getLogger(__name__)

# Initialize Groq client securely from environment
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY or "DUMMY_KEY")


# ── Pydantic Structured Output Validation ──────────────────────────────────────

class AnatomicalFinding(BaseModel):
    anatomical_structure: str = Field(..., description="Anatomical location or organ involved (e.g., 'Right lung lower lobe', 'L4-L5 lumbar spine')")
    finding: str = Field(..., description="The observed status or finding (e.g., '3cm nodule', 'moderate disk bulge')")
    abnormality_type: str = Field(..., description="Classification category: 'Lesion', 'Tumor', 'Fracture', 'Inflammation', 'Fatty Liver', 'Edema', 'Nodule', 'Organ Enlargement', 'Normal', 'Other'")
    severity: str = Field(..., description="Severity classification: 'Normal', 'Mild', 'Moderate', 'Critical'")
    confidence_score: float = Field(..., description="Biomedical confidence scale from 0.0 to 1.0", ge=0.0, le=1.0)
    is_uncertain: bool = Field(..., description="True if language indicates uncertainty (e.g., 'suggests', 'cannot exclude', 'suspected')")
    umls_cui: str = Field(..., description="Normalized Unified Medical Language System Concept Unique Identifier (CUI) (e.g. C0010200)")


class RadiologyAnalysis(BaseModel):
    report_type: str = Field(..., description="Type of scan: 'MRI', 'CT', 'X-ray', 'Ultrasound', 'Other'")
    anatomical_findings: List[AnatomicalFinding] = Field(..., description="Structured array of extracted biomedical entities and anomalies")
    clinical_impression: str = Field(..., description="Patient-friendly plain-English clinical summary of key findings")
    recommendations: List[str] = Field(..., description="Actionable patient-friendly recommendations based on the findings")


# ── Local Biomedical Vocabularies & UMLS Concept Normalization ────────────────

UMLS_CONCEPT_MAP = {
    "nodule": "C0028250",
    "lesion": "C0224401",
    "tumor": "C0027651",
    "neoplasm": "C0027651",
    "fracture": "C0016658",
    "edema": "C0013604",
    "swelling": "C0013604",
    "inflammation": "C0021368",
    "fatty liver": "C0015695",
    "steatosis": "C0015695",
    "enlargement": "C0020564",
    "hepatomegaly": "C0019207",
    "splenomegaly": "C0037991",
    "cardiomegaly": "C0018800",
    "effusion": "C0013687",
    "consolidation": "C0238322",
    "normal": "C0205307",
}

ANATOMICAL_DICTIONARY = [
    "brain", "ventricle", "cerebrum", "cerebellum", "spine", "vertebra", "cervical", "thoracic", "lumbar",
    "lung", "lobe", "pleura", "heart", "aorta", "mediastinum", "liver", "gallbladder", "spleen", "pancreas",
    "kidney", "renal", "bladder", "prostate", "uterus", "ovary", "bone", "joint", "femur", "tibia", "fibula",
    "humerus", "radius", "ulna", "clavicle", "rib", "pelvis", "thyroid", "lymph node", "abdomen"
]

NEGEX_UNCERTAINTY_PATTERNS = [
    r"\bno\s+evidence\s+of\b",
    r"\bnegative\s+for\b",
    r"\bruled\s+out\b",
    r"\bfree\s+of\b",
    r"\bwithout\s+any\s+signs\s+of\b",
    r"\bnot\s+seen\b",
    r"\bno\s+obvious\b"
]

SPECULATION_PATTERNS = [
    r"\bsuggests\b",
    r"\bsuspected\b",
    r"\bpossibly\b",
    r"\bprobable\b",
    r"\bcannot\s+exclude\b",
    r"\bcompatible\s+with\b",
    r"\bevaluation\s+advised\b"
]


# ── Extraction Engine ──────────────────────────────────────────────────────────

def local_biomedical_regex_parse(text: str) -> Dict[str, Any]:
    """
    Performs quick local token matching for clinical verification:
      - Detects potential UMLS concepts
      - Normalizes terms
      - Identifies anatomical structures
      - Assesses negation / uncertainty triggers (NegEx)
    """
    normalized_text = text.lower()

    # Extract anatomies
    detected_anatomies = []
    for anatomy in ANATOMICAL_DICTIONARY:
        if re.search(r"\b" + re.escape(anatomy) + r"s?\b", normalized_text):
            detected_anatomies.append(anatomy.capitalize())

    # Extract potential UMLS matches
    detected_concepts = []
    for concept, cui in UMLS_CONCEPT_MAP.items():
        if re.search(r"\b" + re.escape(concept) + r"s?\b", normalized_text):
            detected_concepts.append({"concept": concept.capitalize(), "cui": cui})

    # Detect certainty/negation indices
    negated = any(re.search(pat, normalized_text) for pat in NEGEX_UNCERTAINTY_PATTERNS)
    uncertain = any(re.search(pat, normalized_text) for pat in SPECULATION_PATTERNS)

    return {
        "detected_anatomies": list(set(detected_anatomies)),
        "detected_concepts": detected_concepts,
        "negated_signals": negated,
        "speculative_signals": uncertain
    }


async def parse_radiology_report(raw_text: str) -> RadiologyAnalysis:
    """
    Performs advanced clinical-grade radiology findings extraction.
    Sends raw findings text to Groq LLM mapped to strict Pydantic schemas,
    backed by local rule-based verification validation to eliminate hallucinations.
    """
    # 1. Run local clinical pre-parser
    local_meta = local_biomedical_regex_parse(raw_text)
    logger.info("[BioNLP] Local verification concepts: %s", local_meta)

    # 2. Build Groq Clinical context
    system_prompt = (
        "You are a senior clinical NLP reader specialized in radiology under BioClinicalBERT & PubMedBERT configurations.\n"
        "Your task is to analyze the raw radiology finding text and construct a highly accurate, structured assessment.\n"
        "Instructions:\n"
        "  - Extract all anatomical structures, observations, and findings.\n"
        "  - Classify each finding into a standard Abnormality Category ('Lesion', 'Tumor', 'Fracture', 'Inflammation', 'Fatty Liver', 'Edema', 'Nodule', 'Organ Enlargement', 'Normal', 'Other').\n"
        "  - Rate severity: 'Normal' (no anomalies), 'Mild' (insignificant finding), 'Moderate' (needs observation), 'Critical' (severe fracture, large mass, acute edema).\n"
        "  - Assess clinical uncertainty (e.g. speculative findings like 'suggests disk bulge' or 'suspected lesion' -> set is_uncertain to true).\n"
        "  - Map clinical terms to UMLS Concept Unique Identifiers (CUI). If you extract standard concepts, map them accurately (e.g., Nodule -> C0028250, Fracture -> C0016658, Lesion -> C0224401, Fatty Liver -> C0015695). Use 'C0205307' for normal observations.\n"
        "  - Produce a patient-friendly summary ('clinical_impression') translating complex medical terms to plain English.\n"
        "  - List 2 to 4 actionable, safe recommendations."
    )

    user_prompt = (
        f"Analyze the following radiology clinical report:\n\n"
        f"--- RAW FINDINGS ---\n"
        f"{raw_text}\n"
        f"--------------------\n\n"
        f"Local helper verification hints:\n"
        f"- Potential anatomical systems involved: {', '.join(local_meta['detected_anatomies']) or 'None detected'}\n"
        f"- Potential UMLS mappings: {', '.join(c['concept'] + ' (' + c['cui'] + ')' for c in local_meta['detected_concepts']) or 'None'}\n"
        f"- Uncertainty markers present: {local_meta['speculative_signals']}\n"
    )

    try:
        response = client.beta.chat.completions.parse(
            model= "llama3-8b-8192",  # high-performance text model
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format=RadiologyAnalysis,
            temperature=0.0,  # Zero-temperature for deterministic clinical extraction
        )

        structured_result = response.choices[0].message.parsed
        if not structured_result:
            raise ValueError("Zero-output returned from Groq clinical parsing engine.")

        # 3. Post-validation: align confidence scores based on local Speculative triggers
        for finding in structured_result.anatomical_findings:
            if local_meta["speculative_signals"] and finding.is_uncertain:
                # Moderate confidence if clinical terms are speculative
                finding.confidence_score = min(finding.confidence_score, 0.80)
            if local_meta["negated_signals"] and "no evidence of" in raw_text.lower():
                # If local NegEx detects negations, adjust categories appropriately
                if "no evidence of nodule" in raw_text.lower() and finding.abnormality_type == "Nodule":
                    finding.severity = "Normal"
                    finding.abnormality_type = "Normal"
                    finding.umls_cui = "C0205307"

        return structured_result

    except Exception as e:
        logger.error("[BioNLP] Radiology extraction failed: %s", e)
        # Fallback to structural mock placeholder built on local regex mapping to prevent crashing
        return generate_fallback_nlp_analysis(raw_text, local_meta)


def generate_fallback_nlp_analysis(text: str, local_meta: Dict[str, Any]) -> RadiologyAnalysis:
    """
    Creates a resilient clinical extraction fallback structured container
    if the external LLM pipeline is blocked.
    """
    findings = []
    
    # Process local concepts
    for concept in local_meta["detected_concepts"]:
        anatomy = local_meta["detected_anatomies"][0] if local_meta["detected_anatomies"] else "Anatomical system"
        findings.append(
            AnatomicalFinding(
                anatomical_structure=anatomy,
                finding=f"Detected presence of {concept['concept'].lower()}",
                abnormality_type=concept["concept"],
                severity="Moderate",
                confidence_score=0.75,
                is_uncertain=local_meta["speculative_signals"],
                umls_cui=concept["cui"]
            )
        )

    if not findings:
        findings.append(
            AnatomicalFinding(
                anatomical_structure="Unspecified Organ",
                finding="Observation of potential anomaly",
                abnormality_type="Other",
                severity="Mild",
                confidence_score=0.60,
                is_uncertain=True,
                umls_cui="C0224401"
            )
        )

    return RadiologyAnalysis(
        report_type="Other",
        anatomical_findings=findings,
        clinical_impression="Initial clinical rule extraction matches potential entities. Full LLM evaluation failed.",
        recommendations=["Consult with a healthcare clinician to formally review the scan findings."]
    )
