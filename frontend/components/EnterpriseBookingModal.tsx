"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X, AlertTriangle, CheckCircle, Calendar, Phone } from "lucide-react";
import axios from "axios";
import { getAuthHeaders } from "@/utils/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface EnterpriseBookingModalProps {
  onClose: () => void;
  centers: { id: number; name: string }[];
}

export default function EnterpriseBookingModal({ onClose, centers }: EnterpriseBookingModalProps) {
  const [step, setStep] = useState(1);
  const [scanModality, setScanModality] = useState("MRI");
  const [centerId, setCenterId] = useState<number | "">(centers.length > 0 ? centers[0].id : "");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  
  // Safety check inputs
  const [allergies, setAllergies] = useState("");
  const [metalImplants, setMetalImplants] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successData, setSuccessData] = useState<any>(null);

  const handleBooking = async () => {
    setLoading(true);
    setError("");
    try {
      // 1. Update safety profile first
      await axios.post(`${API_URL}/api/enterprise/patient-profile`, {
        allergies,
        metal_implants: metalImplants ? 1 : 0,
        contraindications: ""
      }, { headers: getAuthHeaders() });

      // 2. Submit booking request
      const res = await axios.post(`${API_URL}/api/enterprise/book-scan`, {
        center_id: Number(centerId),
        scan_modality: scanModality,
        appointment_time: appointmentTime,
        patient_phone: patientPhone
      }, { headers: getAuthHeaders() });

      if (res.data.success) {
        setSuccessData(res.data);
        setStep(3);
      } else {
        setError(res.data.reasons.join(" "));
        setStep(1); // Go back if safety check fails
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Booking failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          background: "#fff", width: "100%", maxWidth: 500,
          borderRadius: "var(--radius-xl)", overflow: "hidden",
          boxShadow: "0 25px 50px rgba(0,0,0,0.25)"
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F8FAFC" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontFamily: "var(--font-heading)" }}>Book Scan (Sofia AI Flow)</h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)" }}>Multi-Modality & Safety Checks</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px" }}>
          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: 12, borderRadius: 8, marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Sofia AI Safety Check Failed:</strong><br/>
                {error}
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Select Modality</label>
                <select value={scanModality} onChange={(e) => setScanModality(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid var(--color-border)" }}>
                  <option value="MRI">MRI</option>
                  <option value="CT">CT Scan</option>
                  <option value="ULTRASOUND">Ultrasound</option>
                  <option value="X-RAY">X-Ray</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Select Center</label>
                <select value={centerId} onChange={(e) => setCenterId(Number(e.target.value))} style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid var(--color-border)" }}>
                  {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}><Calendar size={13}/> Date/Time</label>
                  <input type="datetime-local" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid var(--color-border)" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}><Phone size={13}/> Patient Phone (for SMS)</label>
                  <input type="text" placeholder="+1..." value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid var(--color-border)" }} />
                </div>
              </div>
              <button onClick={() => setStep(2)} className="btn-primary" style={{ marginTop: 8, padding: 12 }}>Next: Safety Protocol</button>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "#EFF6FF", padding: 12, borderRadius: 8, fontSize: 13, color: "#1D4ED8" }}>
                <strong>Sofia AI Safety Protocol</strong>: We must verify patient safety parameters before sending to RIS.
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Known Allergies (e.g. Iodine)</label>
                <input type="text" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="None" style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid var(--color-border)" }} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
                <input type="checkbox" checked={metalImplants} onChange={(e) => setMetalImplants(e.target.checked)} style={{ width: 18, height: 18 }} />
                Patient has metal implants or pacemaker
              </label>
              
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button onClick={() => setStep(1)} className="btn-secondary" style={{ flex: 1, padding: 12 }}>Back</button>
                <button onClick={handleBooking} disabled={loading} className="btn-primary" style={{ flex: 2, padding: 12 }}>
                  {loading ? "Verifying..." : "Confirm & Book to RIS"}
                </button>
              </div>
            </div>
          )}

          {step === 3 && successData && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <CheckCircle size={48} color="#10B981" style={{ margin: "0 auto 16px" }} />
              <h3 style={{ margin: "0 0 8px 0", fontSize: 20 }}>Booking Confirmed</h3>
              
              <div style={{ background: "#F1F5F9", padding: 16, borderRadius: 8, textAlign: "left", fontSize: 13, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "var(--color-text-muted)" }}>RIS ID:</span>
                  <strong>{successData.ris_reservation_id}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "var(--color-text-muted)" }}>Status:</span>
                  <strong style={{ color: "#10B981" }}>Safety Cleared</strong>
                </div>
                <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: 8, marginTop: 8 }}>
                  <strong style={{ display: "block", marginBottom: 4 }}>Sofia AI Prep Guidelines sent via SMS:</strong>
                  <span style={{ color: "#334155" }}>{successData.prep_guidelines}</span>
                </div>
              </div>

              <button onClick={onClose} className="btn-primary" style={{ width: "100%", padding: 12 }}>Done</button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
