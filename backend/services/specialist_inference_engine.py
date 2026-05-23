"""
services/specialist_inference_engine.py — Advanced Clinical Specialist Inference & Urgency Engine.

Maps multi-modal medical report findings (biomarkers, radiology, ECG) to appropriate specialist types,
classifies urgency level (Routine, Urgent, Critical), and provides patient-friendly reasoning.
"""

from typing import Dict, Any, List, Tuple
import logging

logger = logging.getLogger(__name__)

# Core Medical Mapping database for biomarker and anatomical triggers
BIOMARKER_SPECIALIST_MAP = {
    # Cardiac Markers
    "Troponin": ("Cardiologist", "CRITICAL", "Emergency Room", "elevated Troponin levels indicate high risk of acute myocardial injury"),
    "BNP": ("Cardiologist", "URGENT", "Specialty Clinic", "elevated BNP levels point to possible heart failure or cardiac strain"),
    "CK-MB": ("Cardiologist", "URGENT", "Emergency Room", "elevated CK-MB indicates cardiac muscle damage"),
    # Endocrine & Diabetes
    "HbA1c": ("Endocrinologist", "ROUTINE", "Specialty Clinic", "elevated HbA1c values indicate diabetes or pre-diabetes glycemic state"),
    "TSH": ("Endocrinologist", "ROUTINE", "Specialty Clinic", "abnormal TSH indicates thyroid hormone disregulation"),
    # Renal / Kidney
    "Creatinine": ("Nephrologist", "URGENT", "Specialty Clinic", "high serum creatinine levels point to impaired renal clearance capability"),
    "eGFR": ("Nephrologist", "URGENT", "Specialty Clinic", "reduced eGFR indicates kidney filtration dysfunction"),
    "BUN": ("Nephrologist", "ROUTINE", "Specialty Clinic", "elevated Blood Urea Nitrogen suggests renal strain or dehydration"),
    # Liver / Hepatic
    "ALT": ("Hepatologist", "ROUTINE", "Specialty Clinic", "elevated transaminases (ALT) indicate active hepatic cellular injury"),
    "AST": ("Hepatologist", "ROUTINE", "Specialty Clinic", "elevated AST suggests hepatocellular strain or liver inflammation"),
    "Bilirubin": ("Hepatologist", "URGENT", "Specialty Clinic", "hyperbilirubinemia indicates potential biliary obstruction or liver clearance issues"),
    # Hematology
    "Hemoglobin": ("Hematologist", "ROUTINE", "Primary Care", "abnormal hemoglobin levels suggest anemia or iron metabolic issues"),
    "WBC": ("Infectious Disease Specialist", "URGENT", "Primary Care", "leukocytosis (elevated WBC) strongly indicates acute active infection or inflammation"),
}

RADIOLOGY_KEYWORD_MAP = {
    # Brain / Neurological
    "hemorrhage": ("Neurologist", "CRITICAL", "Emergency Room", "intracranial hemorrhage requires immediate neurological evaluation"),
    "ischemic": ("Neurologist", "URGENT", "Emergency Room", "ischemic change indicates vascular perfusion compromises or stroke risks"),
    "mass": ("Oncologist", "URGENT", "Specialty Clinic", "intracranial or soft-tissue mass findings require oncological review"),
    "nodule": ("Pulmonologist" if "lung" else "Oncologist", "ROUTINE", "Specialty Clinic", "nodular structures require monitoring"),
    # Lungs / Pulmonary
    "opacity": ("Pulmonologist", "URGENT", "Specialty Clinic", "pulmonary opacity suggests potential pneumonia, congestion, or consolidation"),
    "pneumothorax": ("Pulmonologist", "CRITICAL", "Emergency Room", "pneumothorax indicates acute pleural lung collapse risk"),
    "effusion": ("Pulmonologist", "URGENT", "Specialty Clinic", "pleural effusion indicates fluid accumulation in the lung cavity"),
    # Bone / Joint
    "fracture": ("Orthopedic Surgeon", "CRITICAL", "Emergency Room", "structural fracture findings require immediate orthopedic stabilization"),
    "osteopenia": ("Rheumatologist", "ROUTINE", "Primary Care", "bone density reduction suggests metabolic bone disease"),
}

ECG_ARRHYTHMIA_MAP = {
    "st elevation": ("Cardiologist", "CRITICAL", "Emergency Room", "ST elevation is a major indicator of acute myocardial infarction (STEMI)"),
    "atrial fibrillation": ("Cardiologist", "URGENT", "Specialty Clinic", "Atrial fibrillation requires heart rate and anticoagulation controls"),
    "tachycardia": ("Cardiologist", "ROUTINE", "Primary Care", "Tachycardia indicates elevated heart rate and requires cardiovascular screening"),
    "bradycardia": ("Cardiologist", "ROUTINE", "Primary Care", "Bradycardia indicates slower heart rate requiring routine telemetry follow-up"),
}


def infer_specialists(report_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyzes biomarkers, radiology findings, and cardiac results to output
    a list of specialist recommendations, care category, and urgency level.
    """
    recommended_specialists = set()
    care_categories = set()
    urgency_levels = ["ROUTINE"]  # Default base urgency
    reasonings = []
    emergency_triggers = []

    # 1. Parse Biomarkers
    biomarkers = report_data.get("biomarkers", [])
    for b in biomarkers:
        name = b.get("marker_name", "")
        risk = b.get("risk_category", "Normal")
        
        if risk in ("Moderate", "Critical"):
            # Check if biomarker exists in our mapped triggers
            for trigger_key, (specialist, urgency, care, reason) in BIOMARKER_SPECIALIST_MAP.items():
                if trigger_key.lower() in name.lower():
                    recommended_specialists.add(specialist)
                    care_categories.add(care)
                    
                    # If the user biomarker risk is critical, upgrade the trigger urgency
                    actual_urgency = "CRITICAL" if risk == "Critical" else urgency
                    urgency_levels.append(actual_urgency)
                    reasonings.append(f"{name} ({b.get('extracted_value')} {b.get('unit')}): {reason}.")
                    
                    if actual_urgency == "CRITICAL" or care == "Emergency Room":
                        emergency_triggers.append(f"Critical biomarker {name} level: {b.get('extracted_value')}")

    # 2. Parse Radiology Findings
    ai_summary = report_data.get("ai_summary", "")
    overall_health = report_data.get("overall_health_score", 100)
    
    # Check for keywords in the summary text
    for keyword, (specialist, urgency, care, reason) in RADIOLOGY_KEYWORD_MAP.items():
        if keyword.lower() in ai_summary.lower():
            recommended_specialists.add(specialist)
            care_categories.add(care)
            urgency_levels.append(urgency)
            reasonings.append(f"Radiology Finding: {reason}")
            
            if urgency == "CRITICAL" or care == "Emergency Room":
                emergency_triggers.append(f"Critical Radiology finding: {keyword}")

    # 3. Check for specific ECG arrhythmia keywords
    for keyword, (specialist, urgency, care, reason) in ECG_ARRHYTHMIA_MAP.items():
        if keyword.lower() in ai_summary.lower():
            recommended_specialists.add(specialist)
            care_categories.add(care)
            urgency_levels.append(urgency)
            reasonings.append(f"ECG Telemetry: {reason}")
            
            if urgency == "CRITICAL" or care == "Emergency Room":
                emergency_triggers.append(f"Emergency cardiac signal: {keyword}")

    # 4. Resolve Final Urgency & Care Levels
    if "CRITICAL" in urgency_levels:
        final_urgency = "CRITICAL"
        final_care = "Emergency Room"
    elif "URGENT" in urgency_levels:
        final_urgency = "URGENT"
        final_care = "Specialty Clinic"
    else:
        final_urgency = "ROUTINE"
        final_care = "Primary Care"

    # Fallbacks if no specialists were specifically inferred
    if not recommended_specialists:
        if overall_health < 50:
            recommended_specialists.add("Internal Medicine Specialist")
            final_care = "Specialty Clinic"
            final_urgency = "URGENT"
            reasonings.append("Overall health score is severely reduced, recommending complete internal medicine workup.")
        else:
            recommended_specialists.add("Primary Care Physician")
            reasonings.append("Biomarkers are largely within physiological norms. Routine general practitioner follow-up is sufficient.")

    return {
        "specialists": list(recommended_specialists),
        "urgency": final_urgency,
        "care_category": final_care,
        "reasoning": " ".join(reasonings),
        "emergency_triggers": emergency_triggers
    }
