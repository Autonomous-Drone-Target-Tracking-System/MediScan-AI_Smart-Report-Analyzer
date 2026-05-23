"""
services/cardiac_nlp.py — Advanced ECG and Cardiac Report Biomedical NLP Engine.

Uses a hybrid biomedical extraction pipeline:
  1. Local regex-based cardiac concept lexicon matching & UMLS normalization.
  2. NegEx clinical negation filtering.
  3. Llama 3 zero-temperature structured ECG parser with emergency alert classification rules.
"""

from __future__ import annotations

import re
import os
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from groq import Groq

logger = logging.getLogger(__name__)

# Initialize Groq client securely from environment
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY or "DUMMY_KEY")


# ── Pydantic Structured Output Validation ──────────────────────────────────────

class CardiacFinding(BaseModel):
    parameter_name: str = Field(..., description="The cardiac parameter analyzed (e.g. 'Heart Rate', 'Rhythm', 'ST Segment', 'QT Interval', 'Ischemic Markers')")
    extracted_value: str = Field(..., description="Extracted raw value or state (e.g. '112 bpm', 'Atrial Fibrillation', 'ST Elevation in V2-V3', 'Normal')")
    abnormality_type: str = Field(..., description="Classification category: 'Tachycardia', 'Bradycardia', 'Arrhythmia', 'ST Elevation', 'Ischemia', 'Normal', 'Other'")
    severity: str = Field(..., description="Severity classification: 'Normal', 'Mild', 'Moderate', 'Critical', 'Emergency'")
    confidence_score: float = Field(..., description="Biomedical confidence scale from 0.0 to 1.0", ge=0.0, le=1.0)
    umls_cui: str = Field(..., description="UMLS Concept Unique Identifier (CUI) for normalization (e.g. C0039231)")
    is_emergency: bool = Field(..., description="True if this specific finding represents a life-threatening cardiac event (e.g. acute STEMI, extreme tachycardia, severe ventricular block)")


class CardiacAnalysis(BaseModel):
    report_type: str = Field(..., description="Type of report: 'ECG', 'Cardiac Echo', 'Stress Test', 'Holter Monitor'")
    heart_rate: Optional[int] = Field(None, description="Extracted heart rate in beats per minute (bpm)")
    findings: List[CardiacFinding] = Field(..., description="Structured list of extracted electrocardiogram anomalies and findings")
    clinical_impression: str = Field(..., description="Patient-friendly clinical summarization of the cardiac health status")
    is_emergency: bool = Field(..., description="True if any extracted findings represent a medical emergency")
    recommendations: List[str] = Field(..., description="Actionable patient-friendly next steps, prioritizing immediate emergency alerts if needed")


# ── Local Cardiac Vocabularies & UMLS Concept Normalization ────────────────────

UMLS_CARDIAC_MAP = {
    "tachycardia": "C0039231",
    "bradycardia": "C0006012",
    "atrial fibrillation": "C0004238",
    "afib": "C0004238",
    "st elevation": "C0851351",
    "ischemia": "C0022116",
    "ischemic": "C0022116",
    "infarction": "C0027051",
    "myocardial infarction": "C0027051",
    "arrhythmia": "C0003811",
    "ventricular fibrillation": "C0042510",
    "v-fib": "C0042510",
    "premature ventricular contraction": "C0033036",
    "pvc": "C0033036",
    "normal sinus rhythm": "C0232192",
    "nsr": "C0232192",
}

CARDIAC_ANATOMICAL_LEXICON = [
    "sinus rhythm", "st segment", "qt interval", "pr interval", "qrs complex", "t wave", "p wave", 
    "left ventricle", "right ventricle", "atrium", "mitral valve", "aortic valve", "tricuspid valve",
    "septum", "myocardium", "pericardium", "anterior leads", "inferior leads", "lateral leads"
]

NEGEX_PATTERNS = [
    r"\bno\s+evidence\s+of\b",
    r"\bnegative\s+for\b",
    r"\bwithout\s+any\s+signs\s+of\b",
    r"\bnormal\s+st\s+segments\b",
    r"\bno\s+st-t\s+changes\b",
    r"\bno\s+acute\s+ischemic\b",
    r"\bnot\s+observed\b"
]


# ── Extraction Engine ──────────────────────────────────────────────────────────

def local_cardiac_regex_parse(text: str) -> Dict[str, Any]:
    """
    Performs quick local token matching for cardiac verification:
      - Detects potential UMLS concepts
      - Identifies anatomical structures
      - Assesses negation / uncertainty triggers
      - Extracts potential heart rate integers
    """
    normalized_text = text.lower()

    # Extract potential heart rate integers (e.g. "HR: 88 bpm", "heart rate of 110")
    hr_match = re.search(r"\b(?:hr|heart\s+rate|rate)\b[:\s]*(\d{2,3})\b", normalized_text)
    heart_rate = int(hr_match.group(1)) if hr_match else None

    # Extract lead/anatomies
    detected_anatomies = []
    for anatomy in CARDIAC_ANATOMICAL_LEXICON:
        if re.search(r"\b" + re.escape(anatomy) + r"s?\b", normalized_text):
            detected_anatomies.append(anatomy.capitalize())

    # Extract potential UMLS matches
    detected_concepts = []
    for concept, cui in UMLS_CARDIAC_MAP.items():
        if re.search(r"\b" + re.escape(concept) + r"s?\b", normalized_text):
            detected_concepts.append({"concept": concept.capitalize(), "cui": cui})

    # Detect negations
    negated = any(re.search(pat, normalized_text) for pat in NEGEX_PATTERNS)

    return {
        "heart_rate": heart_rate,
        "detected_anatomies": list(set(detected_anatomies)),
        "detected_concepts": detected_concepts,
        "negated_signals": negated
    }


async def parse_cardiac_report(raw_text: str) -> CardiacAnalysis:
    """
    Performs advanced clinical-grade ECG and cardiac findings extraction.
    Sends raw findings text to Groq LLM mapped to strict Pydantic schemas,
    backed by local rule-based verification validation to eliminate hallucinations.
    """
    # 1. Run local clinical pre-parser
    local_meta = local_cardiac_regex_parse(raw_text)
    logger.info("[CardiacNLP] Local verification concepts: %s", local_meta)

    # 2. Build Groq Clinical context
    system_prompt = (
        "You are a senior clinical cardiologist NLP model trained on cardiovascular terminology registries.\n"
        "Your task is to analyze the raw ECG or cardiac report findings and construct a structured analysis.\n"
        "Instructions:\n"
        "  - Extract heart rates, rhythms, ST segment levels, and cardiac parameters.\n"
        "  - Classify findings into abnormality categories ('Tachycardia', 'Bradycardia', 'Arrhythmia', 'ST Elevation', 'Ischemia', 'Normal', 'Other').\n"
        "  - Grade severity: 'Normal' (NSR), 'Mild' (insignificant anomalies), 'Moderate' (needs observation), 'Critical' (severe arrhythmia, significant ischemic indicators), or 'Emergency' (acute ST Elevation, Myocardial Infarction, Ventricular Fibrillation).\n"
        "  - Trigger 'is_emergency = true' if any finding represents an acute, life-threatening event requiring immediate hospitalization (STEMI, ventricular block, active infarction).\n"
        "  - Map clinical terms to UMLS Concept Unique Identifiers (CUI) accurately (e.g. Tachycardia -> C0039231, Atrial Fibrillation -> C0004238, ST Elevation -> C0851351, NSR -> C0232192).\n"
        "  - Translate medical summaries into plain-English clinical impressions.\n"
        "  - Provide actionable, medically safe recommendations, emphasizing emergency referrals if 'is_emergency' is active."
    )

    user_prompt = (
        f"Analyze the following cardiac report findings:\n\n"
        f"--- RAW CARDIAC FINDINGS ---\n"
        f"{raw_text}\n"
        f"----------------------------\n\n"
        f"Local helper verification hints:\n"
        f"- Potential Heart Rate detected: {local_meta['heart_rate'] or 'Not explicitly found'}\n"
        f"- Cardiac concepts present: {', '.join(c['concept'] + ' (' + c['cui'] + ')' for c in local_meta['detected_concepts']) or 'None'}\n"
        f"- Negation triggers: {local_meta['negated_signals']}\n"
    )

    try:
        response = client.beta.chat.completions.parse(
            model="llama3-8b-8192",  # deterministic high-performance structured parser
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format=CardiacAnalysis,
            temperature=0.0,
        )

        structured_result = response.choices[0].message.parsed
        if not structured_result:
            raise ValueError("Zero-output returned from Groq cardiac parsing engine.")

        # 3. Post-validation: override is_emergency and severity based on local NegEx triggers
        for finding in structured_result.findings:
            if local_meta["negated_signals"]:
                if "no st segment" in raw_text.lower() or "no st-t changes" in raw_text.lower() or "no acute ischemic" in raw_text.lower():
                    if finding.abnormality_type in ("ST Elevation", "Ischemia"):
                        finding.severity = "Normal"
                        finding.abnormality_type = "Normal"
                        finding.umls_cui = "C0232192"
                        finding.is_emergency = False

        # Recalculate emergency boundary
        structured_result.is_emergency = any(f.is_emergency for f in structured_result.findings)

        # Ensure heart_rate matches local extraction if LLM missed it
        if not structured_result.heart_rate and local_meta["heart_rate"]:
            structured_result.heart_rate = local_meta["heart_rate"]

        return structured_result

    except Exception as e:
        logger.error("[CardiacNLP] Dynamic parsing failure: %s", e)
        return generate_fallback_cardiac_analysis(raw_text, local_meta)


def generate_fallback_cardiac_analysis(text: str, local_meta: Dict[str, Any]) -> CardiacAnalysis:
    """
    Resilient fallback parser for cardiac structures to prevent app crashes.
    """
    findings = []
    is_emergency = False

    for concept in local_meta["detected_concepts"]:
        severity = "Moderate"
        c_emergency = False
        if "st elevation" in concept["concept"].lower() or "infarction" in concept["concept"].lower():
            severity = "Emergency"
            c_emergency = True
            is_emergency = True

        findings.append(
            CardiacFinding(
                parameter_name="Cardiac rhythm anomaly",
                extracted_value=f"Detected local indicator of {concept['concept'].lower()}",
                abnormality_type=concept["concept"],
                severity=severity,
                confidence_score=0.70,
                umls_cui=concept["cui"],
                is_emergency=c_emergency
            )
        )

    if not findings:
        findings.append(
            CardiacFinding(
                parameter_name="Rhythm segment",
                extracted_value="Normal sinus readings",
                abnormality_type="Normal",
                severity="Normal",
                confidence_score=0.85,
                umls_cui="C0232192",
                is_emergency=False
            )
        )

    return CardiacAnalysis(
        report_type="ECG",
        heart_rate=local_meta["heart_rate"],
        findings=findings,
        clinical_impression="Clinical pre-parser matched cardiovascular keyword signatures. Deep LLM verification failed.",
        is_emergency=is_emergency,
        recommendations=["Consult a healthcare clinician immediately if chest pain or shortness of breath is present."]
    )
