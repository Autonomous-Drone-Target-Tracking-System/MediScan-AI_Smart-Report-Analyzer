import logging
import uuid
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

# --- Sofia AI Enterprise Logic ---

def get_preparation_guidelines(modality: str) -> str:
    """Generates Sofia AI preparation guidelines based on the scan modality."""
    modality = modality.upper()
    if modality == "MRI":
        return "Please arrive 15 mins early. No metal objects allowed. Fast for 2 hours prior."
    elif modality == "CT":
        return "Fast for 4 hours. You may be asked to drink a contrast solution 1 hour prior."
    elif modality == "ULTRASOUND":
        return "Drink 32oz of water 1 hour before the exam. Do not empty your bladder."
    elif modality == "X-RAY":
        return "No special preparation required. Wear comfortable clothing."
    else:
        return "Please follow standard clinical instructions."

def perform_safety_check(modality: str, patient_profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sofia AI Safety Checks:
    Safeguards patients by checking allergies, implants, and contraindications before scans.
    """
    modality = modality.upper()
    is_safe = True
    reasons = []

    if modality == "MRI" and patient_profile.get("metal_implants", 0) == 1:
        is_safe = False
        reasons.append("Patient has a metal implant or pacemaker. MRI is CONTRAINDICATED.")

    allergies = patient_profile.get("allergies", "").lower()
    if modality == "CT" and "iodine" in allergies:
        is_safe = False
        reasons.append("Patient has an iodine allergy. Standard CT contrast is CONTRAINDICATED.")

    return {
        "is_safe": is_safe,
        "reasons": reasons
    }

def reserve_ris_slot(center_id: int, modality: str, appointment_time: str) -> str:
    """
    Simulates seamless integration with RIS (Radiology Information System)
    by reserving a slot automatically and returning a reservation ID.
    """
    # Mocking RIS integration response
    ris_id = f"RIS-{uuid.uuid4().hex[:8].upper()}"
    logger.info(f"Sofia AI RIS Integration: Reserved {modality} at center {center_id} for {appointment_time}. ID: {ris_id}")
    return ris_id

def send_sms_reminder(phone_number: str, appointment_details: str, prep_guidelines: str) -> bool:
    """
    Simulates automated SMS reminders to keep patients informed.
    """
    logger.info(f"Sofia AI SMS Sent to {phone_number}: Reminder for {appointment_details}. Prep: {prep_guidelines}")
    return True

def process_bulk_bill(appointment_ids: List[int]) -> Dict[str, Any]:
    """
    Simplifies bulk billing for multiple patients and accounts.
    """
    total_amount = len(appointment_ids) * 250.00 # Mock average cost
    logger.info(f"Sofia AI Bulk Bill: Processed {len(appointment_ids)} appointments for a total of ${total_amount}.")
    return {
        "success": True,
        "billed_count": len(appointment_ids),
        "total_amount": total_amount,
        "transaction_id": f"TXN-{uuid.uuid4().hex[:12].upper()}"
    }
