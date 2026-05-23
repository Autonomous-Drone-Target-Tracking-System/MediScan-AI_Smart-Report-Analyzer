"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  RadialBarChart, RadialBar, ResponsiveContainer
} from "recharts";
import {
  Activity, AlertCircle, Brain, Salad, Dumbbell, HeartPulse,
  ChevronRight, Printer, Upload, ArrowLeft, Loader2, Info, MapPin
} from "lucide-react";
import axios from "axios";
import Navbar from "@/components/Navbar";
import StatusBadge from "@/components/StatusBadge";
import ChatAssistant from "@/components/ChatAssistant";
import { getAuthHeaders } from "@/utils/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Biomarker {
  marker_id?: number;
  marker_name: string;
  extracted_value: number | null;
  unit: string;
  risk_category: string;
  ai_explanation: string;
  ref_low?: number;
  ref_high?: number;
}

interface PatientInfo {
  name:   string;
  age:    string;
  gender: string;
}

interface AnalysisResult {
  report_id:    number;
  health_score: number;
  biomarkers:   Biomarker[];
  ai_summary:   string;
  recommendations: string[];
  patient_info?: PatientInfo;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function BiomarkerModal({ marker, onClose }: { marker: Biomarker | null; onClose: () => void }) {
  if (!marker) return null;
  const riskColor = marker.risk_category === "Critical" ? "var(--color-danger)"
    : marker.risk_category === "Moderate" ? "var(--color-warning)"
    : "var(--color-success)";

  return (
    <AnimatePresence>
      {marker && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, background: "rgba(11, 15, 26, 0.75)",
              zIndex: 200, backdropFilter: "blur(12px)",
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            style={{
              position: "fixed", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(30, 41, 59, 0.95)",
              backdropFilter: "blur(24px)",
              borderRadius: "var(--radius-xl)",
              padding: "32px", width: "min(520px, 90vw)",
              zIndex: 201,
              boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(59, 130, 246, 0.05)",
              border: "1px solid rgba(59, 130, 246, 0.25)",
              color: "#ffffff"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "22px", fontWeight: 800, marginBottom: 8, color: "#ffffff" }}>
                  {marker.marker_name}
                </h3>
                <StatusBadge risk={marker.risk_category} />
              </div>
              <button onClick={onClose} style={{
                background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "50%", width: 36, height: 36,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                color: "#c6c6cd"
              }}>✕</button>
            </div>

            <div style={{
              background: "rgba(15, 23, 42, 0.5)", borderRadius: "var(--radius-md)",
              padding: "16px 20px", marginBottom: 20,
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderLeft: `4px solid ${riskColor}`,
            }}>
              <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: 4 }}>Measured Value</div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "32px", color: riskColor }}>
                {marker.extracted_value ?? "—"}
                <span style={{ fontSize: "16px", fontWeight: 500, color: "#c6c6cd", marginLeft: 6 }}>
                  {marker.unit}
                </span>
              </div>
            </div>

            <div style={{
              background: "rgba(59, 130, 246, 0.08)", borderRadius: "var(--radius-md)",
              padding: "16px 20px", marginBottom: 20,
              border: "1px solid rgba(59, 130, 246, 0.15)",
              borderLeft: "4px solid var(--color-secondary)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Brain size={16} color="var(--color-secondary)" />
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-secondary)" }}>AI Explanation</span>
              </div>
              <p style={{ fontSize: "14px", color: "#e2e8f0", lineHeight: 1.7, fontStyle: "italic" }}>
                {marker.ai_explanation || "No explanation available."}
              </p>
            </div>

            <p style={{ fontSize: "12px", color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
              <Info size={12} />
              This is AI-generated guidance. Always consult your doctor for medical decisions.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Health Score Gauge ────────────────────────────────────────────────────────
function HealthGauge({ score }: { score: number }) {
  const color = score >= 70 ? "var(--color-success)"
    : score >= 40 ? "var(--color-warning)"
    : "var(--color-danger)";

  const label = score >= 70 ? "Good" : score >= 40 ? "Moderate" : "At Risk";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: 160, height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%" cy="50%"
            innerRadius="72%" outerRadius="90%"
            startAngle={225} endAngle={-45}
            data={[{ value: score, fill: color }]}
            barSize={12}
          >
            <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "rgba(255,255,255,0.15)" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "32px", color: "#ffffff", textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
            {score}
          </div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#ffffff", opacity: 0.95, textTransform: "uppercase", letterSpacing: 1, textShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>
            {label}
          </div>
        </div>
      </div>
      <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)", marginTop: 8, fontWeight: 500 }}>
        out of 100
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
const SECTION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: "easeOut" as const }
  }),
};

const REC_ICONS = [<Salad size={22} />, <Dumbbell size={22} />, <HeartPulse size={22} />];
const REC_COLORS = ["#10B981", "#2563EB", "#EF4444"];
const REC_BGS = ["#ECFDF5", "#EFF6FF", "#FEF2F2"];
const DARK_REC_BGS = ["rgba(16, 185, 129, 0.06)", "rgba(59, 130, 246, 0.06)", "rgba(239, 68, 68, 0.06)"];
const DARK_REC_BORDERS = ["rgba(16, 185, 129, 0.25)", "rgba(59, 130, 246, 0.25)", "rgba(239, 68, 68, 0.25)"];

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params?.reportId;

  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedMarker, setSelectedMarker] = useState<Biomarker | null>(null);

  useEffect(() => {
    if (!reportId) return;
    axios.get(`${API_URL}/api/report/${reportId}`, {
      headers: getAuthHeaders()
    })
      .then((r) => setData(r.data))
      .catch((e) => setErr(e?.response?.data?.detail ?? "Failed to load report."))
      .finally(() => setLoading(false));
  }, [reportId]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0B0F10", color: "#ffffff" }}>
        <Navbar />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
            <Loader2 size={48} color="#3B82F6" />
          </motion.div>
          <p style={{ color: "#94a3b8" }}>Loading your health dashboard...</p>
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#0B0F10", color: "#ffffff" }}>
        <Navbar />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 20 }}>
          <AlertCircle size={48} color="var(--color-danger)" />
          <h2 style={{ fontFamily: "var(--font-heading)", color: "#ffffff" }}>Report Not Found</h2>
          <p style={{ color: "#94a3b8" }}>{err}</p>
          <button onClick={() => router.push("/upload")} className="btn-primary" style={{ boxShadow: "0 4px 14px rgba(37,99,235,0.4)" }}>
            <Upload size={16} /> Try Again
          </button>
        </div>
      </div>
    );
  }

  const critical = data.biomarkers.filter(b => b.risk_category === "Critical");
  const moderate = data.biomarkers.filter(b => b.risk_category === "Moderate");
  const normal = data.biomarkers.filter(b => b.risk_category === "Normal");
  const abnormal = [...critical, ...moderate];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0B0F10",
      color: "#e0e3e5",
      fontFamily: "var(--font-heading)",
      // Local variables override to adapt elements globally
      "--color-bg": "#0B0F10",
      "--color-surface": "rgba(30, 41, 59, 0.6)",
      "--color-surface-2": "rgba(15, 23, 42, 0.8)",
      "--color-text-primary": "#ffffff",
      "--color-text-secondary": "#c6c6cd",
      "--color-text-muted": "#94a3b8",
      "--color-border": "rgba(59, 130, 246, 0.12)",
    } as React.CSSProperties}>
      <Navbar />
      <BiomarkerModal marker={selectedMarker} onClose={() => setSelectedMarker(null)} />

      <div className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
        {/* Back + Print */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <button
            onClick={() => router.push("/upload")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "14px" }}
          >
            <ArrowLeft size={16} /> Upload Another Report
          </button>
          <button
            onClick={() => window.print()}
            className="btn-secondary"
            style={{
              padding: "10px 20px", fontSize: "13px",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#ffffff"
            }}
          >
            <Printer size={15} /> Download Summary
          </button>
        </div>

        {/* ── Section 1: Summary Header ─── */}
        <motion.div
          variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={0}
          style={{
            background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
            borderRadius: "var(--radius-xl)", padding: "36px 40px",
            marginBottom: 28, color: "#ffffff",
            display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap",
            boxShadow: "0 20px 50px rgba(59, 130, 246, 0.15)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: "13px", opacity: 0.8, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Activity size={13} color="var(--color-secondary)" /> Report #{data.report_id} Analysis
            </div>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 800, marginBottom: 16 }}>
              Patient Health Dashboard
            </h1>
            <div style={{ fontSize: "14px", color: "#c6c6cd", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <span>Analysis for <strong style={{ color: "#3B82F6" }}>{data.patient_info?.name || "Patient"}</strong></span>
              <span>•</span>
              <span>Age: <strong>{data.patient_info?.age || "—"}</strong></span>
              <span>•</span>
              <span>Gender: <strong>{data.patient_info?.gender || "—"}</strong></span>
            </div>
            <div className="stat-pills" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {/* Total Markers */}
              <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "var(--radius-md)", padding: "10px 16px", minWidth: 100 }}>
                <div style={{ fontSize: "11px", opacity: 0.85, fontWeight: 600 }}>Total Markers</div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "22px", marginTop: 2 }}>
                  {data.biomarkers.length}
                </div>
              </div>
              
              {/* Critical */}
              <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "var(--radius-md)", padding: "10px 16px", minWidth: 100 }}>
                <div style={{ fontSize: "11px", opacity: 0.85, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-danger)", display: "inline-block", boxShadow: "0 0 8px var(--color-danger)" }} />
                  Critical
                </div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "22px", marginTop: 2, color: critical.length > 0 ? "var(--color-danger)" : "#ffffff" }}>
                  {critical.length}
                </div>
              </div>

              {/* Moderate */}
              <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "var(--radius-md)", padding: "10px 16px", minWidth: 100 }}>
                <div style={{ fontSize: "11px", opacity: 0.85, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-warning)", display: "inline-block", boxShadow: "0 0 8px var(--color-warning)" }} />
                  Moderate
                </div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "22px", marginTop: 2, color: moderate.length > 0 ? "var(--color-warning)" : "#ffffff" }}>
                  {moderate.length}
                </div>
              </div>

              {/* Normal */}
              <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "var(--radius-md)", padding: "10px 16px", minWidth: 100 }}>
                <div style={{ fontSize: "11px", opacity: 0.85, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-success)", display: "inline-block", boxShadow: "0 0 8px var(--color-success)" }} />
                  Normal
                </div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "22px", marginTop: 2 }}>
                  {normal.length}
                </div>
              </div>
            </div>
          </div>
          <HealthGauge score={data.health_score} />
        </motion.div>

        {/* ── Section 2: Biomarker Results ─── */}
        {data.biomarkers.length > 0 && (
          <motion.div variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={1} style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "20px", fontWeight: 700, marginBottom: 16, color: "#ffffff", display: "flex", alignItems: "center", gap: 8 }}>
              🔬 Critical Biomarkers
              <span style={{ fontSize: "13px", fontWeight: 500, color: "#94a3b8", marginLeft: 10 }}>
                Click any card for AI explanation
              </span>
            </h2>
            <div className="grid-3">
              {[...critical, ...moderate, ...normal].map((b, i) => {
                const riskBorderColor = b.risk_category === "Critical" ? "var(--color-danger)"
                  : b.risk_category === "Moderate" ? "var(--color-warning)"
                  : "var(--color-success)";
                return (
                  <motion.div
                    key={b.marker_id ?? i}
                    variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={i * 0.5}
                    whileHover={{ y: -4, borderColor: "rgba(59, 130, 246, 0.4)", boxShadow: "0 10px 30px rgba(59, 130, 246, 0.08), inset 0 0 20px rgba(59, 130, 246, 0.1)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedMarker(b)}
                    style={{
                      cursor: "pointer",
                      background: "rgba(30, 41, 59, 0.6)",
                      backdropFilter: "blur(16px)",
                      border: "1px solid rgba(59, 130, 246, 0.15)",
                      borderLeft: `4px solid ${riskBorderColor}`,
                      borderRadius: "var(--radius-xl)",
                      padding: "24px",
                      boxShadow: "inset 0 0 20px rgba(59, 130, 246, 0.05), 0 8px 32px rgba(0, 0, 0, 0.15)",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff", flex: 1 }}>
                        {b.marker_name}
                      </div>
                      <StatusBadge risk={b.risk_category} size="sm" />
                    </div>
                    <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "28px", color: "#ffffff", marginBottom: 4 }}>
                      {b.extracted_value ?? "—"}
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "#94a3b8", marginLeft: 4 }}>
                        {b.unit}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#94a3b8", fontSize: "12px", marginTop: 12 }}>
                      <Info size={11} color="var(--color-secondary)" />
                      <span style={{ fontWeight: 500 }}>View AI explanation</span>
                      <ChevronRight size={11} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {data.biomarkers.length === 0 && (
          <motion.div variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={1}
            style={{ textAlign: "center", padding: "48px", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "var(--radius-xl)", marginBottom: 28 }}
          >
            <AlertCircle size={40} color="var(--color-warning)" style={{ marginBottom: 12 }} />
            <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, color: "#ffffff" }}>No biomarkers detected</h3>
            <p style={{ color: "#94a3b8", marginTop: 8 }}>
              The OCR couldn't extract recognizable medical values. Try uploading a clearer image or text-based PDF.
            </p>
          </motion.div>
        )}

        {/* ── Section 3: AI Explanation Panel ─── */}
        <motion.div variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={2} style={{ marginBottom: 28 }}>
          <div style={{
            background: "rgba(30, 41, 59, 0.65)",
            backdropFilter: "blur(16px)",
            borderRadius: "var(--radius-xl)",
            border: "1px solid rgba(6, 182, 212, 0.25)",
            borderLeft: "4px solid var(--color-secondary)",
            boxShadow: "0 15px 40px rgba(6, 182, 212, 0.08)",
            overflow: "hidden",
          }}>
            <div style={{ padding: "20px 28px", borderBottom: "1px solid rgba(6, 182, 212, 0.15)", background: "rgba(6, 182, 212, 0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Brain size={20} color="var(--color-secondary)" />
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "16px", color: "var(--color-secondary)" }}>
                  AI Health Summary
                </span>
              </div>
            </div>
            <div style={{ padding: "24px 28px" }}>
              <p style={{
                fontSize: "16px", lineHeight: 1.8, color: "#f1f5f9",
                fontStyle: "italic",
              }}>
                "{data.ai_summary}"
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── Section 4: Recommendations ─── */}
        <motion.div variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={3}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "20px", fontWeight: 700, marginBottom: 16, color: "#ffffff" }}>
            💡 Personalized Recommendations
          </h2>
          <div className="recs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {data.recommendations.map((rec, i) => (
              <motion.div
                key={i}
                variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={i * 0.5}
                whileHover={{ y: -4, boxShadow: "0 10px 30px rgba(59, 130, 246, 0.05)" }}
                style={{
                  background: DARK_REC_BGS[i % 3],
                  borderRadius: "var(--radius-lg)",
                  padding: "24px",
                  border: `1px solid ${DARK_REC_BORDERS[i % 3]}`,
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: "var(--radius-md)",
                  background: REC_COLORS[i % 3] + "20",
                  color: REC_COLORS[i % 3],
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 14,
                }}>
                  {REC_ICONS[i % 3]}
                </div>
                <p style={{ fontSize: "14px", lineHeight: 1.7, color: "#e2e8f0" }}>
                  {rec}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Disclaimer */}
        <motion.div variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={4}
          style={{
            marginTop: 40, padding: "16px 20px",
            background: "rgba(245, 158, 11, 0.08)",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            fontSize: "13px", color: "#fdbb74",
            display: "flex", alignItems: "flex-start", gap: 8
          }}
        >
          <AlertCircle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong style={{ color: "#ffffff" }}>Medical Disclaimer:</strong> This analysis is AI-generated for informational purposes only.
            It is not a medical diagnosis. Always consult a qualified healthcare professional for medical advice.
          </span>
        </motion.div>

        {/* ── AI Chat Assistant ── */}
        <ChatAssistant
          reportId={data.report_id}
          biomarkers={data.biomarkers.map(b => ({
            marker_name:     b.marker_name,
            extracted_value: b.extracted_value,
            unit:            b.unit,
            risk_category:   b.risk_category,
            ref_low:         b.ref_low,
            ref_high:        b.ref_high,
          }))}
          healthScore={data.health_score}
          patientInfo={data.patient_info}
        />

        <style>{`
          /* Local dark mode overrides for Navbar when on this page */
          nav {
            background: rgba(11, 15, 26, 0.85) !important;
            border-bottom: 1px solid rgba(59, 130, 246, 0.15) !important;
          }
          nav div, nav span, nav a {
            color: #ffffff !important;
          }
          nav a:hover {
            color: #3b82f6 !important;
            background: rgba(59, 130, 246, 0.12) !important;
          }
          nav button {
            background: rgba(255, 255, 255, 0.06) !important;
            border-color: rgba(255, 255, 255, 0.1) !important;
            color: #c6c6cd !important;
          }
          nav button:hover {
            background: rgba(239, 68, 68, 0.12) !important;
            color: #ef4444 !important;
            border-color: rgba(239, 68, 68, 0.2) !important;
          }

          @media(max-width:640px) {
            div[style*="grid-template-columns: repeat(3"] { grid-template-columns: 1fr !important; }
          }
          @media print {
            nav, button, .btn-primary, .btn-secondary { display: none !important; }
            * { box-shadow: none !important; }
          }
        `}</style>
      </div>
    </div>
  );
}
