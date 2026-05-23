"use client";

import { useState, useEffect } from "react";
import { Building2, UploadCloud, Smartphone, CreditCard, ShieldCheck, Activity, Users, FileText } from "lucide-react";
import Navbar from "@/components/Navbar";
import EnterpriseBookingModal from "@/components/EnterpriseBookingModal";
import axios from "axios";
import { getAuthHeaders, isAuthenticated } from "@/utils/auth";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function EnterpriseDashboard() {
  const router = useRouter();
  const [isBookingModalOpen, setBookingModalOpen] = useState(false);
  const [centers, setCenters] = useState([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    fetchDashboardData();
  }, [router]);

  const fetchDashboardData = async () => {
    try {
      const [centersRes, apptsRes] = await Promise.all([
        axios.get(`${API_URL}/api/enterprise/centers`, { headers: getAuthHeaders() }),
        axios.get(`${API_URL}/api/enterprise/appointments`, { headers: getAuthHeaders() })
      ]);
      setCenters(centersRes.data.centers);
      setAppointments(apptsRes.data.appointments);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkBill = async () => {
    const unbilledIds = appointments.filter(a => !a.is_billed).map(a => a.appointment_id);
    if (unbilledIds.length === 0) {
      alert("No unbilled appointments found.");
      return;
    }
    if (confirm(`Run Sofia AI Bulk Bill for ${unbilledIds.length} appointments?`)) {
      try {
        const res = await axios.post(`${API_URL}/api/enterprise/bulk-bill`, { appointment_ids: unbilledIds }, { headers: getAuthHeaders() });
        alert(`Bulk Bill Success! Billed ${res.data.billed_count} accounts for $${res.data.total_amount}.\nTXN ID: ${res.data.transaction_id}`);
        fetchDashboardData();
      } catch (e: any) {
        alert(e?.response?.data?.detail || "Bulk billing failed. Admin/Doctor role required.");
      }
    }
  };

  const handleReferralUpload = () => {
    alert("Sofia AI Referral Upload Pipeline initialized. (Mock)");
  };

  const features = [
    { title: "Multi-Modality Scheduling", desc: "Manages CT, MRI, X-ray, Ultrasound. Adapts protocols.", icon: <Activity size={24} color="#0EA5E9" /> },
    { title: "Sofia AI Safety Checks", desc: "Validates allergies, implants, and contraindications before booking.", icon: <ShieldCheck size={24} color="#10B981" /> },
    { title: "RIS Reservation Sync", desc: "Reserves slots automatically in external Radiology Info Systems.", icon: <Building2 size={24} color="#6366F1" /> },
    { title: "Parallel Call Handling", desc: "Enterprise scale. Handles multiple patients via Voice AI simultaneously.", icon: <Users size={24} color="#F59E0B" /> },
    { title: "Bulk Billing Engine", desc: "Simplifies bulk billing for multiple accounts to save time.", icon: <CreditCard size={24} color="#8B5CF6" /> },
    { title: "Automated SMS & Prep", desc: "Sends instructions like fasting/water intake and appointment reminders.", icon: <Smartphone size={24} color="#EC4899" /> },
  ];

  if (loading) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "var(--font-sans)" }}>
      <Navbar />
      
      <main className="container" style={{ paddingTop: 40, paddingBottom: 60 }}>
        
        {/* Header Section */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ fontSize: 36, fontFamily: "var(--font-heading)", color: "#0F172A", marginBottom: 16 }}>
            Sofia AI <span style={{ color: "#0EA5E9" }}>Enterprise Clinic</span>
          </h1>
          <p style={{ fontSize: 18, color: "#64748B", maxWidth: 700, margin: "0 auto" }}>
            AI-driven workflows from booking to reminders, streamlining care for patients and empowering enterprise clinics with scalable tools.
          </p>
        </div>

        {/* Feature Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, marginBottom: 40 }}>
          {features.map((f, i) => (
            <div key={i} style={{ background: "#fff", padding: 24, borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--color-border)" }}>
              <div style={{ background: "#F1F5F9", width: 48, height: 48, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: 18, marginBottom: 8, color: "#1E293B" }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Action Center */}
        <div style={{ background: "#fff", padding: 32, borderRadius: "var(--radius-2xl)", boxShadow: "var(--shadow-md)", border: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h2 style={{ fontSize: 24, margin: 0, fontFamily: "var(--font-heading)" }}>Operations Command Center</h2>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setBookingModalOpen(true)} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Activity size={16} /> Simulate B2B Booking
              </button>
              <button onClick={handleBulkBill} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CreditCard size={16} /> Run Bulk Bill
              </button>
              <button onClick={handleReferralUpload} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <UploadCloud size={16} /> Upload Referral
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E8F0", color: "#64748B", fontSize: 13, textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 16px" }}>Appt ID</th>
                  <th style={{ padding: "12px 16px" }}>Modality</th>
                  <th style={{ padding: "12px 16px" }}>Time</th>
                  <th style={{ padding: "12px 16px" }}>RIS Tracking</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  <th style={{ padding: "12px 16px" }}>Billing</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map(a => (
                  <tr key={a.appointment_id} style={{ borderBottom: "1px solid #E2E8F0" }}>
                    <td style={{ padding: "16px", fontSize: 14, fontWeight: 500 }}>#{a.appointment_id}</td>
                    <td style={{ padding: "16px", fontSize: 14 }}>
                      <span style={{ background: "#EFF6FF", color: "#1D4ED8", padding: "4px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{a.scan_modality}</span>
                    </td>
                    <td style={{ padding: "16px", fontSize: 14, color: "#475569" }}>{new Date(a.appointment_time).toLocaleString()}</td>
                    <td style={{ padding: "16px", fontSize: 14, fontFamily: "monospace", color: "#64748B" }}>{a.ris_reservation_id}</td>
                    <td style={{ padding: "16px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#ECFDF5", color: "#047857", padding: "4px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} />
                        {a.status}
                      </span>
                    </td>
                    <td style={{ padding: "16px", fontSize: 14 }}>
                      {a.is_billed ? (
                        <span style={{ color: "#10B981", display: "flex", alignItems: "center", gap: 4 }}><ShieldCheck size={14}/> Billed</span>
                      ) : (
                        <span style={{ color: "#F59E0B" }}>Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
                {appointments.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#94A3B8" }}>
                      No active enterprise appointments. Simulate a booking above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {isBookingModalOpen && (
        <EnterpriseBookingModal 
          centers={centers} 
          onClose={() => {
            setBookingModalOpen(false);
            fetchDashboardData();
          }} 
        />
      )}
    </div>
  );
}
