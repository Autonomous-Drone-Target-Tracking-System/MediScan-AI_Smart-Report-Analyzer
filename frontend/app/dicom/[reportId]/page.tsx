"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import {
  Activity, ArrowLeft, Loader2, AlertCircle, Maximize2, Minimize2,
  RefreshCw, RotateCw, ZoomIn, ZoomOut, Eye, Settings, FileText,
  Sliders, Info, HelpCircle, User, Edit3, Trash2
} from "lucide-react";
import axios from "axios";
import Navbar from "@/components/Navbar";
import ChatAssistant from "@/components/ChatAssistant";
import { getAuthHeaders } from "@/utils/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface DICOMMetadata {
  modality: string;
  patient_name: string;
  patient_id: string;
  patient_sex: string;
  patient_age: string;
  study_date: string;
  study_description: string;
  manufacturer: string;
  dimensions: string;
  orientation: string;
  window_center: number;
  window_width: number;
}

interface DICOMResult {
  report_id: number;
  metadata: DICOMMetadata;
  image_b64: string;
  overall_health_score: number;
}

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.06, ease: "easeOut" }
  })
};

export default function DICOMViewerPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params?.reportId;

  const [data, setData] = useState<DICOMResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  // Viewer state adjustments
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [inverted, setInverted] = useState(false);
  const [activeTab, setActiveTab] = useState<"tags" | "controls">("tags");

  // Canvas Drawing Annotations
  const [tool, setTool] = useState<"none" | "draw" | "measure">("none");
  const [annotations, setAnnotations] = useState<Array<{ type: string; points: number[][] }>>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  const fetchDICOMData = async () => {
    if (!reportId) return;
    try {
      const res = await axios.get(`${API_URL}/api/dicom/report/${reportId}`, {
        headers: getAuthHeaders()
      });
      setData(res.data);
      setErr("");
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Medical scan has not been preprocessed yet.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDICOMData();
  }, [reportId]);

  const handleProcessScan = async () => {
    if (!reportId) return;
    setAnalyzing(true);
    setErr("");
    try {
      const res = await axios.post(`${API_URL}/api/dicom/analyze/${reportId}`, {}, {
        headers: getAuthHeaders()
      });
      setData(res.data);
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Failed to ingest medical scan.");
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Canvas Annotation Handling ─────────────────────────────────────────────

  useEffect(() => {
    if (!data) return;
    drawCanvas();
  }, [data, zoom, brightness, contrast, rotation, inverted, annotations, tool]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = `data:image/jpeg;base64,${data?.image_b64}`;
    img.onload = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();

      // Configure base canvas dimensions to match display frame
      canvas.width = 440;
      canvas.height = 440;

      // Translate to center for rotation and zoom transformations
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      // Apply image enhancement filters (brightness, contrast, inversion)
      let filterString = `brightness(${brightness}%) contrast(${contrast}%)`;
      if (inverted) filterString += " invert(100%)";
      ctx.filter = filterString;

      // Draw the image slice in center
      ctx.drawImage(img, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
      ctx.restore();

      // Draw annotations on top of the transformed canvas space
      ctx.save();
      annotations.forEach((ann) => {
        ctx.beginPath();
        ctx.strokeStyle = "#F59E0B"; // Gold color for calipers/markers
        ctx.lineWidth = 3;

        if (ann.points.length > 0) {
          ctx.moveTo(ann.points[0][0], ann.points[0][1]);
          for (let idx = 1; idx < ann.points.length; idx++) {
            ctx.lineTo(ann.points[idx][0], ann.points[idx][1]);
          }
          ctx.stroke();

          // Render caliper distance tag if it is a measurement line
          if (ann.type === "measure" && ann.points.length === 2) {
            const dx = ann.points[1][0] - ann.points[0][0];
            const dy = ann.points[1][1] - ann.points[0][1];
            const dist = Math.sqrt(dx * dx + dy * dy).toFixed(1);

            ctx.fillStyle = "#F59E0B";
            ctx.font = "bold 12px sans-serif";
            ctx.fillText(`${dist} px`, ann.points[1][0] + 8, ann.points[1][1] - 8);

            // Draw line terminal calipers
            ctx.fillStyle = "#F59E0B";
            ctx.beginPath();
            ctx.arc(ann.points[0][0], ann.points[0][1], 4, 0, 2 * Math.PI);
            ctx.arc(ann.points[1][0], ann.points[1][1], 4, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      });
      ctx.restore();
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "none") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    isDrawing.current = true;
    setAnnotations((prev) => [...prev, { type: tool, points: [[x, y]] }]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || tool === "none") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setAnnotations((prev) => {
      const copy = [...prev];
      const active = copy[copy.length - 1];
      if (active) {
        if (active.type === "measure") {
          // Caliper lines are exactly two points
          active.points[1] = [x, y];
        } else {
          // Freehand drawing accumulates points
          active.points.push([x, y]);
        }
      }
      return copy;
    });
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  const handleClearAnnotations = () => {
    setAnnotations([]);
  };

  const handleResetFilters = () => {
    setZoom(1);
    setBrightness(100);
    setContrast(100);
    setRotation(0);
    setInverted(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
        <Navbar />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "65vh", gap: 16 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
            <Loader2 size={48} color="var(--color-primary)" />
          </motion.div>
          <p style={{ color: "var(--color-text-secondary)" }}>Configuring open-source imaging viewport...</p>
        </div>
      </div>
    );
  }

  // Not preprocessed scan: render premium Ingestion Station
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
              <Eye size={64} color="var(--color-primary)" style={{ marginBottom: 24, background: "rgba(37,99,235,0.06)", padding: 12, borderRadius: "50%" }} />
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "28px", fontWeight: 800, marginBottom: 12 }}>
                Medical Imaging Viewport
              </h2>
              <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 32 }}>
                This file represents a standard DICOM scan (.dcm) or laboratory imaging study.
                To visualize this locally with active windowing and contrast controls, we will execute a secure sandboxed preprocessing pipeline.
              </p>

              {analyzing ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                    <Loader2 size={36} color="var(--color-primary)" />
                  </motion.div>
                  <span style={{ fontSize: "14px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
                    Ingesting scan structures — parsing DICOM tags, applying window rescale center matrices...
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <button onClick={handleProcessScan} className="btn-primary" style={{ padding: "14px 28px", fontSize: 15, fontWeight: 700 }}>
                    Initialize Image Viewport
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

  // Loaded Visual Workspace
  const meta = data?.metadata;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", paddingBottom: 80 }}>
      <Navbar />

      {/* Header bar */}
      <section style={{
        background: "linear-gradient(160deg, #F8FAFC 0%, #F1F5F9 100%)",
        padding: "40px 0 44px",
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
              marginBottom: "16px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
            }}
          >
            <ArrowLeft size={14} />
            Back to Records
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{
                  background: "var(--color-primary-light, #EFF6FF)",
                  color: "var(--color-primary)",
                  fontSize: "10px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: "10px",
                  border: "1px solid rgba(37,99,235,0.15)",
                }}>
                  Modality: {meta?.modality} Viewer
                </span>
                <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Dimensions: {meta?.dimensions}</span>
              </div>
              <h1 style={{
                fontFamily: "var(--font-heading)",
                fontSize: "28px",
                fontWeight: 900,
                color: "var(--color-text-primary)",
              }}>
                Open-Source Medical Scan Workspace
              </h1>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleResetFilters} className="btn-secondary" style={{ padding: "8px 14px", fontSize: 12 }}>
                <RefreshCw size={12} />
                Reset Viewport
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Workspace Layout */}
      <div className="container" style={{ marginTop: "32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "32px", alignItems: "start" }}>

          {/* Viewport Core column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Control toolbar */}
            <div style={{
              background: "#0F172A",
              borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
              padding: "12px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid #1E293B",
              flexWrap: "wrap",
              gap: 12
            }}>
              {/* Image control calipers */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setTool(tool === "draw" ? "none" : "draw")}
                  style={{
                    background: tool === "draw" ? "#2563EB" : "#1E293B",
                    color: "#fff", border: "none", borderRadius: "6px",
                    padding: "6px 12px", fontSize: 12, fontWeight: 700,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 6
                  }}
                >
                  <Edit3 size={13} />
                  Free Draw
                </button>
                <button
                  onClick={() => setTool(tool === "measure" ? "none" : "measure")}
                  style={{
                    background: tool === "measure" ? "#2563EB" : "#1E293B",
                    color: "#fff", border: "none", borderRadius: "6px",
                    padding: "6px 12px", fontSize: 12, fontWeight: 700,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 6
                  }}
                >
                  <Maximize2 size={13} />
                  Caliper Measure
                </button>
                {annotations.length > 0 && (
                  <button
                    onClick={handleClearAnnotations}
                    style={{
                      background: "#991B1B", color: "#fff", border: "none", borderRadius: "6px",
                      padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 4
                    }}
                  >
                    <Trash2 size={13} />
                    Clear
                  </button>
                )}
              </div>

              {/* View tools */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#94A3B8", fontSize: 12 }}>
                <span style={{ fontFamily: "monospace", opacity: 0.8 }}>Scale: {Math.round(zoom * 100)}%</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setZoom(Math.max(0.5, zoom - 0.15))} style={{ background: "#1E293B", border: "none", color: "#fff", borderRadius: 4, width: 26, height: 26, cursor: "pointer" }}><ZoomOut size={12} /></button>
                  <button onClick={() => setZoom(Math.min(3, zoom + 0.15))} style={{ background: "#1E293B", border: "none", color: "#fff", borderRadius: 4, width: 26, height: 26, cursor: "pointer" }}><ZoomIn size={12} /></button>
                  <button onClick={() => setRotation((prev) => (prev + 90) % 360)} style={{ background: "#1E293B", border: "none", color: "#fff", borderRadius: 4, width: 26, height: 26, cursor: "pointer" }}><RotateCw size={12} /></button>
                </div>
              </div>
            </div>

            {/* Canvas Viewport Frame */}
            <div style={{
              background: "#090D16",
              borderRadius: "0 0 var(--radius-lg) var(--radius-lg)",
              padding: "40px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              border: "1px solid #1E293B",
              boxShadow: "0 24px 80px rgba(0,0,0,0.12)",
              position: "relative"
            }}>
              {tool !== "none" && (
                <div style={{
                  position: "absolute", top: 12, left: 12,
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)",
                  padding: "4px 10px", borderRadius: "12px", fontSize: 11, fontWeight: 700
                }}>
                  Active: Draw caliper annotations directly on canvas.
                </div>
              )}

              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{
                  background: "#000",
                  borderRadius: "8px",
                  boxShadow: "0 12px 36px rgba(0,0,0,0.5)",
                  cursor: tool !== "none" ? "crosshair" : "default"
                }}
              />
            </div>

            {/* Bottom info callout */}
            <div style={{
              background: "#EFF6FF",
              borderRadius: "var(--radius-lg)",
              padding: "20px 24px",
              border: "1px solid rgba(37,99,235,0.15)",
              color: "var(--color-primary)",
              display: "flex",
              gap: 12,
              alignItems: "flex-start"
            }}>
              <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ fontSize: 14, display: "block", marginBottom: 4 }}>DICOM Photometric Calibration Standard</strong>
                <p style={{ margin: 0, fontSize: 12.5, opacity: 0.9, lineHeight: 1.5 }}>
                  This open-source viewport runs client-side canvas rasterization. Image adjustments (brightness, contrast window, orientations) are computed in real-time, eliminating network latency or cloud processing expenses.
                </p>
              </div>
            </div>

          </div>

          {/* Sidebar Telemetry inspector column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            
            {/* Tabs */}
            <div style={{
              background: "#fff",
              borderRadius: "var(--radius-xl)",
              padding: "24px",
              border: "1px solid var(--color-border)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.02)"
            }}>
              <div style={{ display: "flex", background: "var(--color-surface-2)", borderRadius: "var(--radius-md)", padding: 4, marginBottom: 20 }}>
                <button
                  onClick={() => setActiveTab("tags")}
                  style={{
                    flex: 1, padding: "8px", border: "none", borderRadius: "6px",
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                    background: activeTab === "tags" ? "#fff" : "transparent",
                    color: activeTab === "tags" ? "var(--color-text-primary)" : "var(--color-text-muted)"
                  }}
                >
                  DICOM Tags
                </button>
                <button
                  onClick={() => setActiveTab("controls")}
                  style={{
                    flex: 1, padding: "8px", border: "none", borderRadius: "6px",
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                    background: activeTab === "controls" ? "#fff" : "transparent",
                    color: activeTab === "controls" ? "var(--color-text-primary)" : "var(--color-text-muted)"
                  }}
                >
                  Enhancements
                </button>
              </div>

              {activeTab === "tags" ? (
                /* Interactive DICOM Metadata tags inspector */
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {[
                    { label: "Patient Name", value: meta?.patient_name, icon: <User size={13} /> },
                    { label: "Patient ID", value: meta?.patient_id, icon: <HelpCircle size={13} /> },
                    { label: "Patient Age / Sex", value: `${meta?.patient_age} / ${meta?.patient_sex}`, icon: <Info size={13} /> },
                    { label: "Study Description", value: meta?.study_description, icon: <FileText size={13} /> },
                    { label: "Study Date", value: meta?.study_date, icon: <Activity size={13} /> },
                    { label: "Orientation", value: meta?.orientation, icon: <Settings size={13} /> },
                    { label: "Manufacturer", value: meta?.manufacturer, icon: <Sliders size={13} /> },
                  ].map((t) => (
                    <div key={t.label} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 10 }}>
                      <span style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        {t.icon}
                        {t.label}
                      </span>
                      <strong style={{ fontSize: 13.5, color: "var(--color-text-primary)" }}>{t.value}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                /* Enhancements Slider tab */
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <div>
                    <label style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>
                      <span>Brightness Control</span>
                      <span style={{ color: "var(--color-primary)" }}>{brightness}%</span>
                    </label>
                    <input
                      type="range" min="50" max="200" value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "var(--color-primary)" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>
                      <span>Contrast Windowing</span>
                      <span style={{ color: "var(--color-primary)" }}>{contrast}%</span>
                    </label>
                    <input
                      type="range" min="50" max="250" value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "var(--color-primary)" }}
                    />
                  </div>

                  <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 20 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                      <input
                        type="checkbox" checked={inverted}
                        onChange={(e) => setInverted(e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: "var(--color-primary)" }}
                      />
                      <span>Invert Grayscale (Radiography)</span>
                    </label>
                    <p style={{ fontSize: 10.5, color: "var(--color-text-muted)", marginTop: 6, margin: 0 }}>
                      Inverts black/white spectrum. Essential for evaluating bone structure fissures or fine lung consolidations.
                    </p>
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      </div>

      {/* RAG-Aware Chat Assistant */}
      {data && (
        <ChatAssistant
          reportId={reportId as unknown as number}
          healthScore={100}
          patientInfo={{ name: meta?.patient_name ?? "Patient", age: meta?.patient_age ?? "General", gender: meta?.patient_sex ?? "O" }}
          biomarkers={[]}
        />
      )}
    </div>
  );
}
