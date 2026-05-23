"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Activity, AlertCircle, AlertTriangle, CheckCircle2, ChevronRight,
  Info, Loader2, ArrowLeft, Heart, ShieldAlert,
  Clock, FileText, BarChart3, HelpCircle, PhoneCall
} from "lucide-react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Navbar from "@/components/Navbar";
import ChatAssistant from "@/components/ChatAssistant";
import { getAuthHeaders } from "@/utils/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface CardiacFinding {
  parameter_name: string;
  extracted_value: string;
  abnormality_type: string;
  severity: "Normal" | "Mild" | "Moderate" | "Critical" | "Emergency";
  confidence_score: number;
  umls_cui: string;
  is_emergency: boolean;
}

interface CardiacResult {
  report_id: number;
  report_type: string;
  heart_rate: number | null;
  overall_health_score: number;
  clinical_impression: string;
  findings: CardiacFinding[];
  recommendations: string[];
  is_emergency: boolean;
  patient_info: { name: string; age: string; gender: string };
}

interface TrendPoint {
  report_id: number;
  upload_timestamp: string;
  heart_rate: number;
  overall_health_score: number;
}

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

// ── Severity helpers ─────────────────────────────────────────────────────────

function getSeverityColor(sev: string) {
  switch (sev) {
    case "Emergency":  return "#DC2626";
    case "Critical":   return "var(--color-danger)";
    case "Moderate":   return "var(--color-warning)";
    case "Mild":       return "var(--color-info, #2563EB)";
    default:           return "var(--color-success)";
  }
}

function getSeverityBg(sev: string) {
  switch (sev) {
    case "Emergency":  return "#FEE2E2";
    case "Critical":   return "#FEF2F2";
    case "Moderate":   return "#FFFBEB";
    case "Mild":       return "#EFF6FF";
    default:           return "#F0FDF4";
  }
}

// ── Pulsing Heartbeat EKG waveform line tracing ──────────────────────────────

function ECGEKGWaveform({ heartRate }: { heartRate: number }) {
  // Compute animation speed based on heart rate
  const duration = heartRate ? 60 / heartRate : 0.85;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      style={{
        background: "#090D16",
        borderRadius: "var(--radius-xl)",
        padding: "24px 28px",
        border: "1px solid #1E293B",
        boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* Grid overlay background */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: "linear-gradient(rgba(239, 68, 68, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(239, 68, 68, 0.04) 1px, transparent 1px)",
        backgroundSize: "12px 12px",
        pointerEvents: "none"
      }} />

      {/* Futuristic CRT scanline effect */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "linear-gradient(rgba(18, 24, 38, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))",
        backgroundSize: "100% 4px, 6px 100%",
        pointerEvents: "none",
        opacity: 0.65
      }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1, marginBottom: 16 }}>
        <h4 style={{ fontFamily: "var(--font-heading)", color: "#64748B", fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, display: "flex", alignItems: "center", gap: 8 }}>
          <Activity size={14} color="#EF4444" className="emergency-pulse" />
          Active EKG Rhythm Tracing
        </h4>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(239, 68, 68, 0.06)", padding: "6px 14px", borderRadius: "99px", border: "1px solid rgba(239, 68, 68, 0.15)" }}>
          <Heart size={16} color="#EF4444" fill="#EF4444" style={{ animation: `pulse ${duration}s infinite cubic-bezier(0.215, 0.61, 0.355, 1)` }} />
          <span className="glow-text-danger" style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 900, color: "#EF4444", letterSpacing: "-0.5px" }}>
            {heartRate ? `${heartRate} BPM` : "—"}
          </span>
        </div>
      </div>

      <div style={{ height: "100px", position: "relative", zIndex: 1, display: "flex", alignItems: "center" }}>
        <svg viewBox="0 0 400 100" width="100%" height="80%" preserveAspectRatio="none" style={{ overflow: "visible" }}>
          {/* Static ECG line backer */}
          <path
            d="M 0 50 L 80 50 L 90 40 L 98 62 L 102 12 L 110 88 L 116 48 L 126 50 L 220 50 L 230 40 L 238 62 L 242 12 L 250 88 L 256 48 L 266 50 L 400 50"
            fill="none"
            stroke="rgba(239, 68, 68, 0.08)"
            strokeWidth="2"
          />

          {/* Animating heartbeat stroke with realistic CRT glow filter */}
          <motion.path
            d="M 0 50 L 80 50 L 90 40 L 98 62 L 102 12 L 110 88 L 116 48 L 126 50 L 220 50 L 230 40 L 238 62 L 242 12 L 250 88 L 256 48 L 266 50 L 400 50"
            fill="none"
            stroke="#EF4444"
            strokeWidth="3"
            strokeLinecap="round"
            filter="drop-shadow(0px 0px 5px rgba(239, 68, 68, 0.8))"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        </svg>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.9; }
          25% { transform: scale(1.25); opacity: 1; filter: drop-shadow(0 0 6px rgba(239,68,68,0.8)); }
          50% { transform: scale(1); opacity: 0.9; }
          100% { transform: scale(1); opacity: 0.9; }
        }
      `}</style>
    </motion.div>
  );
}

// --- Main Page Component ---

export default function CardiacDashboard() {
  const params = useParams();
  const router = useRouter();
  const reportId = params?.reportId;

  const [data, setData] = useState<CardiacResult | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const fetchCardiacData = async () => {
    if (!reportId) return;
    try {
      // 1. Fetch current analysis
      const res = await axios.get(`${API_URL}/api/cardiac/report/${reportId}`, {
        headers: getAuthHeaders()
      });
      setData(res.data);

      // 2. Fetch trends
      const trendRes = await axios.get(`${API_URL}/api/cardiac/trends`, {
        headers: getAuthHeaders()
      });
      setTrends(trendRes.data.trends ?? []);
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "ECG parameters not analyzed yet.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCardiacData();
  }, [reportId]);

  const handleAnalyzeCardiac = async () => {
    if (!reportId) return;
    setAnalyzing(true);
    setErr("");
    try {
      const res = await axios.post(`${API_URL}/api/cardiac/analyze/${reportId}`, {}, {
        headers: getAuthHeaders()
      });
      setData(res.data);
      
      const trendRes = await axios.get(`${API_URL}/api/cardiac/trends`, {
        headers: getAuthHeaders()
      });
      setTrends(trendRes.data.trends ?? []);
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "ECG clinical extraction failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
        <Navbar />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "65vh", gap: 16 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
            <Loader2 size={48} color="var(--color-primary)" />
          </motion.div>
          <p style={{ color: "var(--color-text-secondary)" }}>Loading ECG cardiac dashboards...</p>
        </div>
      </div>
    );
  }

  // Not parsed state: render beautiful call-to-action
  if (err && !data) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
        <Navbar />
        <div className="container" style={{ padding: "80px 0" }}>
          <div style={{
            maxWidth: "600px",
            margin: "0 auto",
            background: "#fff",
            borderRadius: "var(--radius-xl)",
            padding: "48px",
            border: "1px solid var(--color-border)",
            textAlign: "center",
            boxShadow: "0 24px 80px rgba(0,0,0,0.04)"
          }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Heart size={64} color="#EF4444" style={{ marginBottom: 24, background: "rgba(239,68,68,0.06)", padding: 12, borderRadius: "50%", animation: "pulse 1.5s infinite" }} />
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "28px", fontWeight: 800, marginBottom: 12 }}>
                ECG Cardiac Analyzer
              </h2>
              <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 32 }}>
                This document is flagged as a cardiovascular scan or ECG summary. 
                MediScan AI can execute a specialized cardiac NLP module to extract anomalies, arrhythmias, tachycardias, and ischemic ST elevations.
              </p>

              {analyzing ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                    <Loader2 size={36} color="var(--color-primary)" />
                  </motion.div>
                  <span style={{ fontSize: "14px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
                    Running Cardiology NLP Sandbox — tracing ST leads, mapping arrhythmia categories...
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <button onClick={handleAnalyzeCardiac} className="btn-primary" style={{ padding: "14px 28px", fontSize: 15, fontWeight: 700, background: "#EF4444", borderColor: "#EF4444" }}>
                    Analyze with EKG/Cardiac Engine
                  </button>
                  <button onClick={() => router.push("/history")} style={{ background: "transparent", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>
                    Back to History
                  </button>
                </div>
              )}

              {err && <div style={{ marginTop: 20, color: "var(--color-danger)", fontSize: 13, display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><AlertCircle size={14} />{err}</div>}
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // Loaded State
  const findings = data?.findings ?? [];
  const overallScore = data?.overall_health_score ?? 100;
  const isEmergency = data?.is_emergency ?? false;
  const healthColor = getSeverityColor(isEmergency ? "Emergency" : overallScore < 50 ? "Critical" : overallScore < 80 ? "Moderate" : "Normal");

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", paddingBottom: 80 }}>
      <Navbar />

      {/* ── EMERGENCY MEDICAL WARNING BANNER ── */}
      {isEmergency && (
        <div style={{
          background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)",
          color: "#fff",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          boxShadow: "0 10px 30px rgba(220,38,38,0.2)",
          position: "sticky",
          top: 0,
          zIndex: 100
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ShieldAlert size={28} color="#fff" style={{ animation: "pulse 1s infinite" }} />
            <div>
              <strong style={{ fontSize: 15, textTransform: "uppercase", letterSpacing: 0.5 }}>ACUTE EMERGENCY CRITICAL DETECTED</strong>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.9 }}>
                Our cardiac NLP engine has extracted findings indicative of an active myocardial injury or acute arrhythmia. Seek emergency medical services immediately.
              </p>
            </div>
          </div>
          <a href="tel:911" style={{
            background: "#fff", color: "#DC2626", border: "none", borderRadius: "var(--radius-full)",
            padding: "8px 18px", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", gap: 6,
            textDecoration: "none", boxShadow: "0 4px 10px rgba(0,0,0,0.12)"
          }}>
            <PhoneCall size={14} />
            Call Emergency (911)
          </a>
        </div>
      )}

      {/* ── Page Header ── */}
      <section style={{
        background: "linear-gradient(160deg, #F8FAFC 0%, #FEF2F2 100%)",
        padding: "48px 0 52px",
        borderBottom: "1px solid var(--color-border)",
      }}>
        <div className="container">
          <button
            onClick={() => router.push("/history")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#fff",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              marginBottom: "24px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
            }}
          >
            <ArrowLeft size={14} />
            Back to Records
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{
                  background: "#FEF2F2",
                  color: "#DC2626",
                  fontSize: "11px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  border: "1px solid rgba(220,38,38,0.15)",
                }}>
                  {data?.report_type} Module
                </span>
                <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>ID: #{reportId}</span>
              </div>
              <h1 style={{
                fontFamily: "var(--font-heading)",
                fontSize: "32px",
                fontWeight: 900,
                color: "var(--color-text-primary)",
                letterSpacing: "-0.5px"
              }}>
                Cardiovascular Health Intelligence
              </h1>
            </div>

            {/* Severity rating gauge */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", padding: "16px 24px", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: 0.5 }}>Arrhythmia Severity Scale</div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 800, color: healthColor }}>
                  {isEmergency ? "Emergency Alert" : overallScore >= 80 ? "Sinus Rhythm (Clear)" : "Attention Needed"}
                </div>
              </div>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: healthColor + "12",
                border: `3px solid ${healthColor}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-heading)", fontWeight: 800, color: healthColor, fontSize: 16
              }}>
                {overallScore}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Layout Grid ── */}
      <div className="container" style={{ marginTop: "40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "32px", alignItems: "start" }}>
          
          {/* Main Content Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            
            {/* Pulsing EKG Graph */}
            <ECGEKGWaveform heartRate={data?.heart_rate ?? 72} />

            {/* 1. Clinical Impression Summary */}
            <motion.div
              custom={1}
              variants={FADE_UP}
              initial="hidden"
              animate="visible"
              style={{
                background: "#fff",
                borderRadius: "var(--radius-xl)",
                padding: "32px",
                border: "1px solid var(--color-border)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.02)",
              }}
            >
              <h3 style={{
                fontFamily: "var(--font-heading)",
                fontSize: "20px",
                fontWeight: 800,
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                <BarChart3 size={20} color="#EF4444" />
                Clinical ECG Interpretation
              </h3>
              <p style={{
                fontSize: "15px",
                lineHeight: "1.65",
                color: "#334155",
                background: "var(--color-surface-2)",
                padding: "20px 24px",
                borderRadius: "var(--radius-md)",
                borderLeft: "4px solid #EF4444",
              }}>
                {data?.clinical_impression}
              </p>
            </motion.div>

            {/* 2. Structured Findings Table */}
            <motion.div
              custom={2}
              variants={FADE_UP}
              initial="hidden"
              animate="visible"
              style={{
                background: "#fff",
                borderRadius: "var(--radius-xl)",
                padding: "32px",
                border: "1px solid var(--color-border)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.02)",
              }}
            >
              <h3 style={{
                fontFamily: "var(--font-heading)",
                fontSize: "20px",
                fontWeight: 800,
                marginBottom: "24px",
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                <Activity size={20} color="#EF4444" />
                Cardiology Entity Parameters & Normalization
              </h3>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--color-border)", paddingBottom: 12 }}>
                      <th style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)" }}>Parameter</th>
                      <th style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)" }}>Value / Status</th>
                      <th style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)" }}>Classification</th>
                      <th style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)" }}>Severity</th>
                      <th style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)" }}>UMLS Normalised</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map((f, i) => {
                      const color = getSeverityColor(f.severity);
                      const bg = getSeverityBg(f.severity);

                      return (
                        <tr key={i} style={{ borderBottom: "1px solid var(--color-border)", verticalAlign: "middle" }}>
                          <td style={{ padding: "16px", fontWeight: 700, color: "var(--color-text-primary)", fontSize: 14 }}>
                            {f.parameter_name}
                          </td>
                          <td style={{ padding: "16px", color: "var(--color-text-secondary)", fontSize: 13.5, fontWeight: 600 }}>
                            {f.extracted_value}
                          </td>
                          <td style={{ padding: "16px" }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#475569", background: "#F1F5F9", padding: "3px 8px", borderRadius: 6 }}>
                              {f.abnormality_type}
                            </span>
                          </td>
                          <td style={{ padding: "16px" }}>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color,
                              background: bg,
                              padding: "4px 10px",
                              borderRadius: "20px",
                              border: `1px solid ${color}20`
                            }}>
                              {f.severity}
                            </span>
                          </td>
                          <td style={{ padding: "16px" }}>
                            {f.umls_cui ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "var(--color-primary)" }}>
                                  {f.umls_cui}
                                </span>
                                <span style={{ fontSize: 9, color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                                  UMLS concept CUI
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* 3. Action Recommendations */}
            <motion.div
              custom={3}
              variants={FADE_UP}
              initial="hidden"
              animate="visible"
              style={{
                background: "#fff",
                borderRadius: "var(--radius-xl)",
                padding: "32px",
                border: "1px solid var(--color-border)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.02)",
              }}
            >
              <h3 style={{
                fontFamily: "var(--font-heading)",
                fontSize: "20px",
                fontWeight: 800,
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                <ShieldAlert size={20} color="#EF4444" />
                Actionable Heart Recommendations
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {data?.recommendations.map((rec, i) => (
                  <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: "rgba(239,68,68,0.08)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#EF4444",
                      fontWeight: 700, fontSize: 12, flexShrink: 0, marginTop: 2
                    }}>{i + 1}</div>
                    <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 }}>
                      {rec}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>

          </div>

          {/* Sidebar Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            
            {/* Heart rate trends */}
            {trends.length > 1 && (
              <div style={{
                background: "#fff",
                borderRadius: "var(--radius-xl)",
                padding: "24px",
                border: "1px solid var(--color-border)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.02)",
              }}>
                <h4 style={{ fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 800, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                  <BarChart3 size={15} color="#EF4444" />
                  Longitudinal Heart Rate
                </h4>

                <div style={{ width: "100%", height: "180px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="report_id" stroke="#94A3B8" fontSize={10} tickFormatter={(v) => `R#${v}`} />
                      <YAxis stroke="#94A3B8" fontSize={10} domain={['dataMin - 10', 'dataMax + 10']} />
                      <Tooltip formatter={(value) => [`${value} bpm`, 'Heart Rate']} />
                      <Line type="monotone" dataKey="heart_rate" stroke="#EF4444" strokeWidth={2.5} activeDot={{ r: 6 }} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 12, textAlign: "center" }}>
                  Evolution curve of resting heart rates over active clinical periods.
                </p>
              </div>
            )}

            {/* Cardiac statistics checklist */}
            <div style={{
              background: "#fff",
              borderRadius: "var(--radius-xl)",
              padding: "24px",
              border: "1px solid var(--color-border)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.02)",
            }}>
              <h4 style={{ fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 800, marginBottom: 12 }}>
                Extraction Integrity Details
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--color-text-muted)" }}>Confidence Score:</span>
                  <strong style={{ color: "var(--color-success)" }}>
                    {Math.round((findings.reduce((acc, curr) => acc + curr.confidence_score, 0) / findings.length) * 100)}%
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--color-text-muted)" }}>Rhythm Tracker:</span>
                  <span style={{ fontWeight: 600 }}>NSR Alignment check</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--color-text-muted)" }}>Telemetry Leads:</span>
                  <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>Active</span>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* RAG-Aware Chat Assistant */}
      {data && (
        <ChatAssistant
          reportId={reportId as unknown as number}
          healthScore={overallScore}
          patientInfo={data.patient_info}
          biomarkers={findings.map(f => ({
            marker_name: f.parameter_name,
            extracted_value: f.extracted_value ? parseFloat(f.extracted_value) || null : null,
            unit: "",
            risk_category: f.severity,
            ai_explanation: f.extracted_value
          }))}
        />
      )}
    </div>
  );
}
