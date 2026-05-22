"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  RadialBarChart, RadialBar, ResponsiveContainer
} from "recharts";
import {
  Activity, AlertCircle, Brain, Salad, Dumbbell, HeartPulse,
  ChevronRight, Printer, Upload, ArrowLeft, Loader2, Info
} from "lucide-react";
import axios from "axios";
import Navbar from "@/components/Navbar";
import StatusBadge from "@/components/StatusBadge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Biomarker {
  marker_id?: number;
  marker_name: string;
  extracted_value: number | null;
  unit: string;
  risk_category: string;
  ai_explanation: string;
}

interface AnalysisResult {
  report_id: number;
  health_score: number;
  biomarkers: Biomarker[];
  ai_summary: string;
  recommendations: string[];
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
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
              zIndex: 200, backdropFilter: "blur(4px)",
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            style={{
              position: "fixed", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#fff", borderRadius: "var(--radius-xl)",
              padding: "32px", width: "min(520px, 90vw)",
              zIndex: 201, boxShadow: "0 24px 80px rgba(0,0,0,0.20)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "22px", fontWeight: 800, marginBottom: 8 }}>
                  {marker.marker_name}
                </h3>
                <StatusBadge risk={marker.risk_category} />
              </div>
              <button onClick={onClose} style={{
                background: "var(--color-surface-2)", border: "none",
                borderRadius: "50%", width: 36, height: 36,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>✕</button>
            </div>

            <div style={{
              background: "var(--color-surface-2)", borderRadius: "var(--radius-md)",
              padding: "16px 20px", marginBottom: 20,
              borderLeft: `4px solid ${riskColor}`,
            }}>
              <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: 4 }}>Measured Value</div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "32px", color: riskColor }}>
                {marker.extracted_value ?? "—"}
                <span style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-text-secondary)", marginLeft: 6 }}>
                  {marker.unit}
                </span>
              </div>
            </div>

            <div style={{
              background: "#EFF6FF", borderRadius: "var(--radius-md)",
              padding: "16px 20px", marginBottom: 20,
              borderLeft: "4px solid var(--color-secondary)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Brain size={16} color="var(--color-secondary)" />
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-secondary)" }}>AI Explanation</span>
              </div>
              <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", lineHeight: 1.7, fontStyle: "italic" }}>
                {marker.ai_explanation || "No explanation available."}
              </p>
            </div>

            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
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

  const data = [
    { name: "Score", value: score, fill: color },
    { name: "Remaining", value: 100 - score, fill: "transparent" },
  ];

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
            <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "#F1F5F9" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "32px", color }}>
            {score}
          </div>
          <div style={{ fontSize: "11px", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 1 }}>
            {label}
          </div>
        </div>
      </div>
      <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: 8 }}>
        out of 100
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: "easeOut" }
  }),
};

const REC_ICONS = [<Salad size={22} />, <Dumbbell size={22} />, <HeartPulse size={22} />];
const REC_COLORS = ["#10B981", "#2563EB", "#EF4444"];
const REC_BGS = ["#ECFDF5", "#EFF6FF", "#FEF2F2"];

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
    axios.get(`${API_URL}/api/report/${reportId}`)
      .then((r) => setData(r.data))
      .catch((e) => setErr(e?.response?.data?.detail ?? "Failed to load report."))
      .finally(() => setLoading(false));
  }, [reportId]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
        <Navbar />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
            <Loader2 size={48} color="var(--color-primary)" />
          </motion.div>
          <p style={{ color: "var(--color-text-secondary)" }}>Loading your health dashboard...</p>
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
        <Navbar />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 20 }}>
          <AlertCircle size={48} color="var(--color-danger)" />
          <h2 style={{ fontFamily: "var(--font-heading)" }}>Report Not Found</h2>
          <p style={{ color: "var(--color-text-secondary)" }}>{err}</p>
          <button onClick={() => router.push("/upload")} className="btn-primary">
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
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Navbar />
      <BiomarkerModal marker={selectedMarker} onClose={() => setSelectedMarker(null)} />

      <div className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
        {/* Back + Print */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <button
            onClick={() => router.push("/upload")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "14px" }}
          >
            <ArrowLeft size={16} /> Upload Another Report
          </button>
          <button
            onClick={() => window.print()}
            className="btn-secondary"
            style={{ padding: "10px 20px", fontSize: "13px" }}
          >
            <Printer size={15} /> Download Summary
          </button>
        </div>

        {/* ── Section 1: Summary Header ─── */}
        <motion.div
          variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={0}
          style={{
            background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)",
            borderRadius: "var(--radius-xl)", padding: "36px 40px",
            marginBottom: 28, color: "#fff",
            display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap",
            boxShadow: "0 8px 32px rgba(37,99,235,0.30)",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: "13px", opacity: 0.8, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Activity size={13} /> Report #{data.report_id} Analysis
            </div>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 800, marginBottom: 16 }}>
              Health Analysis Dashboard
            </h1>
            <div className="stat-pills" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: "var(--radius-md)", padding: "10px 16px" }}>
                <div style={{ fontSize: "11px", opacity: 0.75 }}>Total Markers</div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "22px" }}>
                  {data.biomarkers.length}
                </div>
              </div>
              <div style={{ background: "rgba(239,68,68,0.25)", borderRadius: "var(--radius-md)", padding: "10px 16px" }}>
                <div style={{ fontSize: "11px", opacity: 0.75 }}>Critical</div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "22px" }}>
                  {critical.length}
                </div>
              </div>
              <div style={{ background: "rgba(245,158,11,0.25)", borderRadius: "var(--radius-md)", padding: "10px 16px" }}>
                <div style={{ fontSize: "11px", opacity: 0.75 }}>Moderate</div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "22px" }}>
                  {moderate.length}
                </div>
              </div>
              <div style={{ background: "rgba(16,185,129,0.25)", borderRadius: "var(--radius-md)", padding: "10px 16px" }}>
                <div style={{ fontSize: "11px", opacity: 0.75 }}>Normal</div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "22px" }}>
                  {normal.length}
                </div>
              </div>
            </div>
          </div>
          <HealthGauge score={data.health_score} />
        </motion.div>

        {/* ── Section 2: Critical Findings ─── */}
        {data.biomarkers.length > 0 && (
          <motion.div variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={1} style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "20px", fontWeight: 700, marginBottom: 16 }}>
              🔬 Biomarker Results
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-muted)", marginLeft: 10 }}>
                Click any card for AI explanation
              </span>
            </h2>
            <div className="grid-3">
              {[...critical, ...moderate, ...normal].map((b, i) => {
                const riskBorder = b.risk_category === "Critical" ? "risk-border-critical"
                  : b.risk_category === "Moderate" ? "risk-border-moderate"
                  : "risk-border-normal";
                return (
                  <motion.div
                    key={b.marker_id ?? i}
                    variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={i * 0.5}
                    whileHover={{ y: -4, transition: { duration: 0.15 } }}
                    onClick={() => setSelectedMarker(b)}
                    className={`card ${riskBorder}`}
                    style={{ cursor: "pointer", transition: "all 0.2s" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)", flex: 1 }}>
                        {b.marker_name}
                      </div>
                      <StatusBadge risk={b.risk_category} size="sm" />
                    </div>
                    <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "28px", color: "var(--color-text-primary)", marginBottom: 4 }}>
                      {b.extracted_value ?? "—"}
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-muted)", marginLeft: 4 }}>
                        {b.unit}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--color-text-muted)", fontSize: "12px" }}>
                      <Info size={11} />
                      View AI explanation
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
            style={{ textAlign: "center", padding: "48px", background: "#FFFBEB", borderRadius: "var(--radius-xl)", marginBottom: 28, border: "1px solid #FDE68A" }}
          >
            <AlertCircle size={40} color="var(--color-warning)" style={{ marginBottom: 12 }} />
            <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 700 }}>No biomarkers detected</h3>
            <p style={{ color: "var(--color-text-secondary)", marginTop: 8 }}>
              The OCR couldn't extract recognizable medical values. Try uploading a clearer image or text-based PDF.
            </p>
          </motion.div>
        )}

        {/* ── Section 3: AI Explanation Panel ─── */}
        <motion.div variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={2} style={{ marginBottom: 28 }}>
          <div style={{
            background: "var(--color-surface)", borderRadius: "var(--radius-xl)",
            border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)",
            borderLeft: "4px solid var(--color-secondary)", overflow: "hidden",
          }}>
            <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--color-border)", background: "#F0FDFE" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Brain size={20} color="var(--color-secondary)" />
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "16px", color: "#0E7490" }}>
                  AI Health Summary
                </span>
              </div>
            </div>
            <div style={{ padding: "24px 28px" }}>
              <p style={{
                fontSize: "16px", lineHeight: 1.8, color: "var(--color-text-secondary)",
                fontStyle: "italic",
              }}>
                "{data.ai_summary}"
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── Section 4: Recommendations ─── */}
        <motion.div variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={3}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "20px", fontWeight: 700, marginBottom: 16 }}>
            💡 Personalized Recommendations
          </h2>
          <div className="recs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {data.recommendations.map((rec, i) => (
              <motion.div
                key={i}
                variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={i * 0.5}
                whileHover={{ y: -4, transition: { duration: 0.15 } }}
                style={{
                  background: REC_BGS[i % 3],
                  borderRadius: "var(--radius-lg)",
                  padding: "24px",
                  border: `1px solid ${REC_COLORS[i % 3]}20`,
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
                <p style={{ fontSize: "14px", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
                  {rec}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Disclaimer */}
        <motion.div variants={SECTION_VARIANTS} initial="hidden" animate="visible" custom={4}
          style={{ marginTop: 40, padding: "16px 20px", background: "#FFF7ED", borderRadius: "var(--radius-md)", border: "1px solid #FED7AA", fontSize: "13px", color: "#9A3412", display: "flex", alignItems: "flex-start", gap: 8 }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Medical Disclaimer:</strong> This analysis is AI-generated for informational purposes only.
            It is not a medical diagnosis. Always consult a qualified healthcare professional for medical advice.
          </span>
        </motion.div>

        <style>{`
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
