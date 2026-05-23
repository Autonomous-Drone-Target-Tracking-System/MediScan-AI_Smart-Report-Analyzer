"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Activity, AlertCircle, AlertTriangle, CheckCircle2, ChevronRight,
  Info, Loader2, ArrowLeft, HeartPulse, ShieldAlert,
  Brain, FileText, ClipboardList, Stethoscope, HelpCircle
} from "lucide-react";
import axios from "axios";
import Navbar from "@/components/Navbar";
import StatusBadge from "@/components/StatusBadge";
import ChatAssistant from "@/components/ChatAssistant";
import { getAuthHeaders } from "@/utils/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface AnatomicalFinding {
  anatomical_structure: string;
  finding: string;
  abnormality_type: string;
  severity: "Normal" | "Mild" | "Moderate" | "Critical";
  confidence_score: number;
  is_uncertain: boolean;
  umls_cui: string;
}

interface RadiologyResult {
  report_id: number;
  report_type: string;
  overall_health_score: number;
  clinical_impression: string;
  findings: AnatomicalFinding[];
  recommendations: string[];
  patient_info: { name: string; age: string; gender: string };
}

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

// --- Severity helpers ---

function getSeverityColor(sev: string) {
  switch (sev) {
    case "Critical":   return "var(--color-danger)";
    case "Moderate":   return "var(--color-warning)";
    case "Mild":       return "var(--color-info, #2563EB)";
    default:           return "var(--color-success)";
  }
}

// --- Severity background helpers ---
function getSeverityBg(sev: string) {
  switch (sev) {
    case "Critical":   return "#FEF2F2";
    case "Moderate":   return "#FFFBEB";
    case "Mild":       return "#EFF6FF";
    default:           return "#F0FDF4";
  }
}

// --- Interactive Anatomical SVG Diagram ---

function InteractiveAnatomicalDiagram({ findings }: { findings: AnatomicalFinding[] }) {
  // Identify flagged anatomy regions
  const lowerFindings = findings.map(f => f.anatomical_structure.toLowerCase());
  
  const hasBrain = lowerFindings.some(x => x.includes("brain") || x.includes("cerebr") || x.includes("head"));
  const hasSpine = lowerFindings.some(x => x.includes("spine") || x.includes("vert") || x.includes("cervical") || x.includes("lumbar") || x.includes("thoracic"));
  const hasChest = lowerFindings.some(x => x.includes("lung") || x.includes("lobe") || x.includes("chest") || x.includes("heart") || x.includes("rib"));
  const hasAbdomen = lowerFindings.some(x => x.includes("liver") || x.includes("spleen") || x.includes("pancreas") || x.includes("gallbladder") || x.includes("kidney") || x.includes("abdomen"));
  const hasPelvis = lowerFindings.some(x => x.includes("pelvis") || x.includes("bladder") || x.includes("uterus") || x.includes("prostate"));
  const hasExtremities = lowerFindings.some(x => x.includes("femur") || x.includes("tibia") || x.includes("fibula") || x.includes("humerus") || x.includes("joint") || x.includes("bone"));

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="glassmorphic-medical-panel"
      style={{
        borderRadius: "var(--radius-xl)",
        padding: "28px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* Background ambient glow if active findings are critical */}
      {(hasBrain || hasChest || hasSpine) && (
        <div style={{
          position: "absolute",
          top: "-20px",
          width: "150px",
          height: "150px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(239,68,68,0.06) 0%, transparent 70%)",
          filter: "blur(20px)",
          pointerEvents: "none"
        }} />
      )}

      <h3 style={{
        fontFamily: "var(--font-heading)",
        fontSize: "18px",
        fontWeight: 800,
        marginBottom: "16px",
        alignSelf: "flex-start",
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "var(--color-text-primary)"
      }}>
        <Activity size={18} className="glow-text-primary" color="var(--color-primary)" style={{ animation: "pulse 2s infinite" }} />
        Anatomical Impact Mapping
      </h3>
      
      <p style={{
        fontSize: "12px",
        color: "var(--color-text-secondary)",
        marginBottom: "24px",
        textAlign: "center",
        lineHeight: 1.4
      }}>
        Biomedical NLP anatomical structures extracted from text mapped onto standard human anatomy.
      </p>

      {/* Styled Interactive SVG Body Diagram */}
      <div style={{ width: "200px", height: "360px", position: "relative" }}>
        <svg viewBox="0 0 100 180" width="100%" height="100%" style={{ overflow: "visible" }}>
          {/* Base human body outline */}
          <path
            d="M50 10 c5-5 10 0 10 5 c0 5-5 8-5 10 c0 3 3 5 5 7 c4 4 10 10 12 18 c2 8 2 15 2 25 c0 10-2 20-2 30 c0 15 2 25 3 40 c1 10 1 20-3 30 c-2 5-6 5-8 0 c-2-10-3-20-4-30 c-1-10-2-20-2-30 c0 10-1 20-2 30 c-1 10-2 20-4 30 c-2 5-6 5-8 0 c-4-10-4-20-3-30 c1-15 3-25 3-40 c0-10-2-20-2-30 c0-10 0-17 2-25 c2-8 8-14 12-18 c2-2 5-4 5-7 c0-2-5-5-5-10 c0-5 5-10 10-5 z"
            fill="#F8FAFC"
            stroke="#E2E8F0"
            strokeWidth="1.5"
            style={{ transition: "fill 0.3s ease" }}
          />

          {/* Brain / Head Circle */}
          <motion.circle
            cx="50" cy="15" r="9"
            fill={hasBrain ? "rgba(239, 68, 68, 0.18)" : "transparent"}
            stroke={hasBrain ? "#EF4444" : "#CBD5E1"}
            strokeWidth={hasBrain ? "2" : "1"}
            strokeDasharray={hasBrain ? "0" : "2,2"}
            whileHover={{ scale: 1.15 }}
            style={{ cursor: "pointer", transition: "all 0.3s ease" }}
          />

          {/* Spine indicator */}
          <motion.path
            d="M50 25 L50 85"
            stroke={hasSpine ? "#EF4444" : "#CBD5E1"}
            strokeWidth={hasSpine ? "3" : "1.5"}
            strokeDasharray={hasSpine ? "0" : "3,3"}
            fill="none"
            animate={hasSpine ? { strokeWidth: [3, 4, 3] } : {}}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />

          {/* Chest / Lungs block */}
          <motion.rect
            x="41" y="32" width="18" height="20" rx="3"
            fill={hasChest ? "rgba(239, 68, 68, 0.15)" : "transparent"}
            stroke={hasChest ? "#EF4444" : "transparent"}
            strokeWidth="1.5"
            whileHover={{ scale: 1.08 }}
            style={{ originX: 0.5, originY: 0.5, transition: "all 0.2s" }}
          />
          {/* Mini lung curves */}
          <path d="M43 35 c-2 4-2 10 2 12 M57 35 c2 4 2 10-2 12" stroke={hasChest ? "#EF4444" : "#CBD5E1"} strokeWidth="1.5" fill="none" />

          {/* Abdomen block */}
          <motion.rect
            x="40" y="55" width="20" height="18" rx="2"
            fill={hasAbdomen ? "rgba(245, 158, 11, 0.15)" : "transparent"}
            stroke={hasAbdomen ? "#F59E0B" : "transparent"}
            strokeWidth="1.5"
            whileHover={{ scale: 1.08 }}
            style={{ originX: 0.5, originY: 0.5, transition: "all 0.2s" }}
          />
          <circle cx="50" cy="64" r="5" fill="none" stroke={hasAbdomen ? "#F59E0B" : "#CBD5E1"} strokeWidth="1.2" />

          {/* Pelvis block */}
          <motion.path
            d="M39 77 L61 77 L57 88 L43 88 Z"
            fill={hasPelvis ? "rgba(245, 158, 11, 0.15)" : "transparent"}
            stroke={hasPelvis ? "#F59E0B" : "#CBD5E1"}
            strokeWidth="1.2"
            whileHover={{ scale: 1.05 }}
            style={{ originX: 0.5, originY: 0.5 }}
          />

          {/* Extremities / Bone highlights */}
          {hasExtremities && (
            <>
              <motion.line x1="33" y1="92" x2="31" y2="128" stroke="#EF4444" strokeWidth="2.5" animate={{ strokeWidth: [2.5, 3.5, 2.5] }} transition={{ repeat: Infinity, duration: 1.2 }} />
              <motion.line x1="67" y1="92" x2="69" y2="128" stroke="#EF4444" strokeWidth="2.5" animate={{ strokeWidth: [2.5, 3.5, 2.5] }} transition={{ repeat: Infinity, duration: 1.2 }} />
            </>
          )}
        </svg>

        {/* Floating Hotspot Badges */}
        <div style={{ position: "absolute", top: "4%", left: "55%", display: "flex", gap: 4 }}>
          {hasBrain && <span className="emergency-pulse" style={{ fontSize: 9, background: "#FEF2F2", border: "1px solid #EF4444", color: "#EF4444", padding: "2px 6px", borderRadius: 4, fontWeight: 700, boxShadow: "0 2px 8px rgba(239,68,68,0.15)" }}>Head System</span>}
        </div>
        <div style={{ position: "absolute", top: "20%", left: "62%" }}>
          {hasChest && <span className="emergency-pulse" style={{ fontSize: 9, background: "#FEF2F2", border: "1px solid #EF4444", color: "#EF4444", padding: "2px 6px", borderRadius: 4, fontWeight: 700, boxShadow: "0 2px 8px rgba(239,68,68,0.15)" }}>Thoracic System</span>}
        </div>
        <div style={{ position: "absolute", top: "35%", left: "64%" }}>
          {hasAbdomen && <span style={{ fontSize: 9, background: "#FFFBEB", border: "1px solid #F59E0B", color: "#B45309", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>Abdominal</span>}
        </div>
        <div style={{ position: "absolute", top: "15%", left: "-15%" }}>
          {hasSpine && <span className="emergency-pulse" style={{ fontSize: 9, background: "#FEF2F2", border: "1px solid #EF4444", color: "#EF4444", padding: "2px 6px", borderRadius: 4, fontWeight: 700, boxShadow: "0 2px 8px rgba(239,68,68,0.15)" }}>Spinal Cord</span>}
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center", marginTop: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>
          <span className="emergency-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444" }} />
          Critical Impact
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B" }} />
          Moderate Impact
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#CBD5E1" }} />
          Healthy Systems
        </div>
      </div>
    </motion.div>
  );
}

// --- Main Page Component ---

export default function RadiologyDashboard() {
  const params = useParams();
  const router = useRouter();
  const reportId = params?.reportId;

  const [data, setData] = useState<RadiologyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const fetchRadiologyData = async () => {
    if (!reportId) return;
    try {
      const res = await axios.get(`${API_URL}/api/radiology/report/${reportId}`, {
        headers: getAuthHeaders()
      });
      setData(res.data);
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Radiology findings not processed or unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRadiologyData();
  }, [reportId]);

  const handleAnalyzeRadiology = async () => {
    if (!reportId) return;
    setAnalyzing(true);
    setErr("");
    try {
      const res = await axios.post(`${API_URL}/api/radiology/analyze/${reportId}`, {}, {
        headers: getAuthHeaders()
      });
      setData(res.data);
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Radiology scan extraction failed.");
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
          <p style={{ color: "var(--color-text-secondary)" }}>Loading radiology report scans...</p>
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
              <Brain size={64} color="var(--color-primary)" style={{ marginBottom: 24, background: "rgba(37,99,235,0.06)", padding: 12, borderRadius: "50%" }} />
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "28px", fontWeight: 800, marginBottom: 12 }}>
                Radiology NLP Unlocked
              </h2>
              <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 32 }}>
                This file appears to be a radiology scan finding (MRI, CT, X-ray, or Ultrasound). 
                MediScan AI can run an advanced BioClinicalBERT & PubMedBERT NLP pipeline to understand and extract entities from it.
              </p>

              {analyzing ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                    <Loader2 size={36} color="var(--color-primary)" />
                  </motion.div>
                  <span style={{ fontSize: "14px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
                    Running BioNLP Sandbox Extraction — parsing structures, normalising terminology...
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <button onClick={handleAnalyzeRadiology} className="btn-primary" style={{ padding: "14px 28px", fontSize: 15, fontWeight: 700 }}>
                    Analyze with BioNLP Engine
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
  const healthColor = getSeverityColor(overallScore < 50 ? "Critical" : overallScore < 80 ? "Moderate" : "Normal");

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", paddingBottom: 80 }}>
      <Navbar />

      {/* ── Page Header ── */}
      <section style={{
        background: "linear-gradient(160deg, #F8FAFC 0%, #EFF6FF 100%)",
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
                  background: "var(--color-primary-light, #EFF6FF)",
                  color: "var(--color-primary)",
                  fontSize: "11px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  border: "1px solid rgba(37,99,235,0.15)",
                }}>
                  {data?.report_type} Scan
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
                Radiology Intelligence Dashboard
              </h1>
            </div>

            {/* Overall severity gauge */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", padding: "16px 24px", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: 0.5 }}>Radiological Status</div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 800, color: healthColor }}>
                  {overallScore >= 90 ? "Clear Scan" : overallScore >= 70 ? "Moderate Findings" : "Critical Findings"}
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
          
          {/* Main content column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            
            {/* 1. Clinical Impression Panel */}
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
                position: "relative"
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
                <ClipboardList size={20} color="var(--color-primary)" />
                Clinical Impression Summary
              </h3>
              <p style={{
                fontSize: "15px",
                lineHeight: "1.65",
                color: "#334155",
                background: "var(--color-surface-2)",
                padding: "20px 24px",
                borderRadius: "var(--radius-md)",
                borderLeft: "4px solid var(--color-primary)",
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
                <Stethoscope size={20} color="var(--color-primary)" />
                Extracted Anatomical Entities & Observations
              </h3>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--color-border)", paddingBottom: 12 }}>
                      <th style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)" }}>Anatomy</th>
                      <th style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)" }}>Findings & Observations</th>
                      <th style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)" }}>Classification</th>
                      <th style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)" }}>Severity</th>
                      <th style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)" }}>UMLS Concept</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map((f, i) => {
                      const color = getSeverityColor(f.severity);
                      const bg = getSeverityBg(f.severity);

                      return (
                        <tr key={i} style={{ borderBottom: "1px solid var(--color-border)", verticalAlign: "middle" }}>
                          <td style={{ padding: "16px", fontWeight: 700, color: "var(--color-text-primary)", fontSize: 14 }}>
                            {f.anatomical_structure}
                          </td>
                          <td style={{ padding: "16px", color: "var(--color-text-secondary)", fontSize: 13.5, lineHeight: 1.4 }}>
                            {f.finding}
                            {f.is_uncertain && (
                              <span style={{
                                fontSize: 9.5,
                                background: "#FFFBEB",
                                color: "#B45309",
                                border: "1px solid rgba(245,158,11,0.3)",
                                padding: "1px 6px",
                                borderRadius: 4,
                                marginLeft: 8,
                                fontWeight: 700,
                                textTransform: "uppercase"
                              }}>
                                Speculative Signal
                              </span>
                            )}
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
                                <span style={{ fontSize: 9, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                                  UMLS CUI Normalised
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

            {/* 3. Patient Friendly Action Recommendations */}
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
                <ShieldAlert size={20} color="var(--color-primary)" />
                Actionable Patient Recommendations
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {data?.recommendations.map((rec, i) => (
                  <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: "rgba(37,99,235,0.08)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--color-primary)",
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
            
            {/* Anatomy Highlight Diagram */}
            <InteractiveAnatomicalDiagram findings={findings} />

            {/* BioNLP Confidence Ratings */}
            <div style={{
              background: "#fff",
              borderRadius: "var(--radius-xl)",
              padding: "24px",
              border: "1px solid var(--color-border)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.02)",
            }}>
              <h4 style={{ fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 800, marginBottom: 12 }}>
                Extraction Integrity Scale
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--color-text-muted)" }}>Confidence Score:</span>
                  <strong style={{ color: "var(--color-success)" }}>
                    {Math.round((findings.reduce((acc, curr) => acc + curr.confidence_score, 0) / findings.length) * 100)}%
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--color-text-muted)" }}>Validation Model:</span>
                  <span style={{ fontWeight: 600 }}>PubMedBERT Hybrid</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--color-text-muted)" }}>UMLS Normalisation:</span>
                  <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>Enabled</span>
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
            marker_name: f.anatomical_structure,
            extracted_value: f.finding ? 1.0 : null,
            unit: "",
            risk_category: f.severity,
            ai_explanation: f.finding
          }))}
        />
      )}
    </div>
  );
}
