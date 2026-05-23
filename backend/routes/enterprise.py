from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import logging
from db.database import get_connection
from services.security_deps import get_current_user
from services.enterprise_service import (
    get_preparation_guidelines,
    perform_safety_check,
    reserve_ris_slot,
    send_sms_reminder,
    process_bulk_bill
)

logger = logging.getLogger(__name__)
router = APIRouter()

# --- Schemas ---

class BookingRequest(BaseModel):
    center_id: int
    scan_modality: str
    appointment_time: str
    patient_phone: str

class ReferralUpload(BaseModel):
    appointment_id: int
    document_url: str

class BulkBillRequest(BaseModel):
    appointment_ids: List[int]

class SafetyProfileUpdate(BaseModel):
    allergies: str
    metal_implants: int
    contraindications: str

# --- Endpoints ---

@router.get("/centers")
def get_enterprise_centers():
    """Retrieves all enterprise network centers."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT center_id, name, address FROM enterprise_centers WHERE is_active = 1")
        centers = [{"id": row[0], "name": row[1], "address": row[2]} for row in cur.fetchall()]
        
        # Seed dummy centers if none exist
        if not centers:
            dummy_centers = [
                ("Metro General Hospital", "100 Main St, NY"),
                ("Advanced Diagnostics Center", "450 Med Center Blvd, NY"),
                ("Community Imaging Clinic", "78 Health Way, NJ")
            ]
            for name, address in dummy_centers:
                cur.execute("INSERT INTO enterprise_centers (name, address) VALUES (?, ?)", (name, address))
            conn.commit()
            cur.execute("SELECT center_id, name, address FROM enterprise_centers WHERE is_active = 1")
            centers = [{"id": row[0], "name": row[1], "address": row[2]} for row in cur.fetchall()]
            
        return {"centers": centers}
    finally:
        conn.close()

@router.post("/patient-profile")
def update_safety_profile(profile: SafetyProfileUpdate, current_user: dict = Depends(get_current_user)):
    """Updates the patient's safety profile (allergies, implants) for Sofia AI Safety Checks."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        user_id = current_user["user_id"]
        
        cur.execute("SELECT profile_id FROM patient_profiles WHERE user_id = ?", (user_id,))
        exists = cur.fetchone()
        
        if exists:
            cur.execute("""
                UPDATE patient_profiles 
                SET allergies = ?, metal_implants = ?, contraindications = ? 
                WHERE user_id = ?
            """, (profile.allergies, profile.metal_implants, profile.contraindications, user_id))
        else:
            cur.execute("""
                INSERT INTO patient_profiles (user_id, allergies, metal_implants, contraindications)
                VALUES (?, ?, ?, ?)
            """, (user_id, profile.allergies, profile.metal_implants, profile.contraindications))
        conn.commit()
        return {"message": "Safety profile updated successfully."}
    finally:
        conn.close()

@router.post("/book-scan")
def book_enterprise_scan(request: BookingRequest, current_user: dict = Depends(get_current_user)):
    """
    Sofia AI Unified Booking Workflow:
    Executes Safety Checks -> Modality Workflows -> RIS Reservation -> SMS Reminders.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        user_id = current_user["user_id"]

        # 1. Retrieve Safety Profile
        cur.execute("SELECT allergies, metal_implants, contraindications FROM patient_profiles WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        profile = {
            "allergies": row[0] if row else "",
            "metal_implants": row[1] if row else 0,
            "contraindications": row[2] if row else ""
        }

        # 2. Sofia AI Safety Checks
        safety_result = perform_safety_check(request.scan_modality, profile)
        if not safety_result["is_safe"]:
            return {
                "success": False,
                "error": "SAFETY_CHECK_FAILED",
                "reasons": safety_result["reasons"]
            }

        # 3. Scan Specific Workflows (Prep Guidelines)
        prep_guidelines = get_preparation_guidelines(request.scan_modality)

        # 4. RIS Reservation Integration
        ris_id = reserve_ris_slot(request.center_id, request.scan_modality, request.appointment_time)

        # 5. Database Insertion
        cur.execute("""
            INSERT INTO enterprise_appointments 
            (user_id, center_id, scan_modality, appointment_time, prep_guidelines, safety_cleared, ris_reservation_id)
            VALUES (?, ?, ?, ?, ?, 1, ?)
        """, (user_id, request.center_id, request.scan_modality, request.appointment_time, prep_guidelines, ris_id))
        
        appointment_id = cur.lastrowid
        conn.commit()

        # 6. SMS Dispatch
        sms_details = f"{request.scan_modality} at Center #{request.center_id} on {request.appointment_time}"
        send_sms_reminder(request.patient_phone, sms_details, prep_guidelines)

        return {
            "success": True,
            "appointment_id": appointment_id,
            "ris_reservation_id": ris_id,
            "prep_guidelines": prep_guidelines,
            "message": "Appointment booked, RIS synchronized, and SMS reminder sent."
        }
    finally:
        conn.close()

@router.post("/upload-referral")
def upload_referral_form(request: ReferralUpload, current_user: dict = Depends(get_current_user)):
    """Allows providers/patients to upload referral forms directly."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO referral_documents (appointment_id, user_id, document_url)
            VALUES (?, ?, ?)
        """, (request.appointment_id, current_user["user_id"], request.document_url))
        conn.commit()
        return {"success": True, "message": "Referral document linked to appointment."}
    finally:
        conn.close()

@router.post("/bulk-bill")
def trigger_bulk_billing(request: BulkBillRequest, current_user: dict = Depends(get_current_user)):
    """Sofia AI Bulk Billing feature."""
    if current_user.get("role") != "admin" and current_user.get("role") != "doctor":
        raise HTTPException(status_code=403, detail="Not authorized to run bulk billing.")

    result = process_bulk_bill(request.appointment_ids)
    
    conn = get_connection()
    try:
        cur = conn.cursor()
        for appt_id in request.appointment_ids:
            cur.execute("UPDATE enterprise_appointments SET is_billed = 1 WHERE appointment_id = ?", (appt_id,))
        conn.commit()
    finally:
        conn.close()

    return result

@router.get("/appointments")
def list_appointments(current_user: dict = Depends(get_current_user)):
    """List appointments for the B2B dashboard."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        # If admin/doctor, get all unbilled for the bulk bill demo
        if current_user.get("role") in ["admin", "doctor"]:
            cur.execute("""
                SELECT appointment_id, scan_modality, appointment_time, status, ris_reservation_id, is_billed
                FROM enterprise_appointments
                ORDER BY appointment_id DESC LIMIT 10
            """)
        else:
            cur.execute("""
                SELECT appointment_id, scan_modality, appointment_time, status, ris_reservation_id, is_billed
                FROM enterprise_appointments
                WHERE user_id = ?
                ORDER BY appointment_id DESC
            """, (current_user["user_id"],))
            
        columns = [column[0] for column in cur.description]
        results = [dict(zip(columns, row)) for row in cur.fetchall()]
        return {"appointments": results}
    finally:
        conn.close()
