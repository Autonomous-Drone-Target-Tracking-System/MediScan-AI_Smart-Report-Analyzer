"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Image as ImageIcon, X, CheckCircle, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import axios from "axios";
import { getAuthHeaders } from "@/utils/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type UploadState = "idle" | "uploading" | "analyzing" | "done" | "error";

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const ALLOWED = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

  const handleFile = useCallback((f: File) => {
    if (!ALLOWED.includes(f.type)) {
      setError("Only PDF, JPG, or PNG files are supported.");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setError("File is too large. Max size is 20 MB.");
      return;
    }
    setError("");
    setFile(f);
    if (f.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setState("uploading");
    setStatusMsg("Uploading report...");
    setError("");

    try {
      const form = new FormData();
      form.append("file", file);
      const headers = getAuthHeaders();
      delete headers["Content-Type"]; // Let browser/axios dynamically calculate multipart boundary
      const uploadRes = await axios.post(`${API_URL}/api/upload`, form, { headers });
      const { report_id } = uploadRes.data;

      setState("analyzing");
      setStatusMsg("Running AI analysis — extracting biomarkers...");

      await axios.post(`${API_URL}/api/analyze/${report_id}`, {}, {
        headers: getAuthHeaders()
      });

      setState("done");
      setStatusMsg("Analysis complete! Redirecting...");

      setTimeout(() => router.push(`/dashboard/${report_id}`), 800);
    } catch (err: any) {
      setState("error");
      let msg = err?.response?.data?.detail ?? err?.message ?? "Something went wrong.";
      if (typeof msg === "object") {
        if (Array.isArray(msg)) {
          msg = msg.map((item: any) => {
            const locStr = item.loc ? item.loc.filter((l: any) => l !== "body").join(".") : "";
            return `${locStr ? locStr + ": " : ""}${item.msg || JSON.stringify(item)}`;
          }).join("; ");
        } else {
          msg = msg.message ?? JSON.stringify(msg);
        }
      }
      setError(msg);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setState("idle");
    setError("");
    setStatusMsg("");
  };

  const isProcessing = state === "uploading" || state === "analyzing";

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Navbar />

      <div className="container" style={{ paddingTop: 60, paddingBottom: 80 }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: "center", marginBottom: 48 }}
        >
          <h1 style={{
            fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 44px)",
            fontWeight: 800, marginBottom: 12,
          }}>
            Upload Your <span className="gradient-text">Medical Report</span>
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "17px" }}>
            Supports PDF, JPG, and PNG · Max 20 MB · Results in under 15 seconds
          </p>
        </motion.div>

        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {/* Upload Card */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div
              id="upload-dropzone"
              onClick={() => !file && !isProcessing && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={{
                background: dragOver ? "#EFF6FF" : "#FFFFFF",
                border: `2px dashed ${dragOver ? "var(--color-primary)" : file ? "var(--color-success)" : "#CBD5E1"}`,
                borderRadius: "var(--radius-xl)",
                padding: file ? "28px" : "64px 32px",
                textAlign: "center",
                cursor: file || isProcessing ? "default" : "pointer",
                transition: "all 0.25s ease",
                boxShadow: dragOver ? "var(--shadow-glow-primary)" : "var(--shadow-md)",
                position: "relative",
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                capture="environment"
                onChange={onInputChange}
                style={{ display: "none" }}
                id="file-input"
              />

              <AnimatePresence mode="wait">
                {!file && !isProcessing && (
                  <motion.div key="empty"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  >
                    <motion.div
                      animate={dragOver ? { scale: 1.1 } : { scale: 1 }}
                      style={{
                        width: 72, height: 72, borderRadius: "var(--radius-lg)",
                        background: dragOver ? "#EFF6FF" : "#F8FAFC",
                        border: "1px solid var(--color-border)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        margin: "0 auto 20px",
                      }}
                    >
                      <Upload size={32} color={dragOver ? "var(--color-primary)" : "var(--color-text-muted)"} />
                    </motion.div>
                    <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700, marginBottom: 8 }}>
                      {dragOver ? "Drop your file here!" : "Drag & Drop your report"}
                    </h3>
                    <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginBottom: 20 }}>
                      or click to browse — PDF, JPG, PNG supported
                    </p>
                    <span style={{
                      background: "var(--color-surface-2)", color: "var(--color-text-secondary)",
                      borderRadius: "var(--radius-full)", padding: "6px 16px", fontSize: "12px",
                    }}>
                      Max file size: 20 MB
                    </span>
                  </motion.div>
                )}

                {file && !isProcessing && state !== "done" && (
                  <motion.div key="preview"
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  >
                    {/* Remove button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); reset(); }}
                      style={{
                        position: "absolute", top: 16, right: 16,
                        background: "#FEE2E2", border: "none", borderRadius: "50%",
                        width: 32, height: 32, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <X size={16} color="#DC2626" />
                    </button>

                    <div style={{ display: "flex", alignItems: "center", gap: 16, textAlign: "left" }}>
                      {preview ? (
                        <img src={preview} alt="preview"
                          style={{ width: 80, height: 80, objectFit: "cover", borderRadius: "var(--radius-md)" }}
                        />
                      ) : (
                        <div style={{
                          width: 80, height: 80, borderRadius: "var(--radius-md)",
                          background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <FileText size={36} color="var(--color-primary)" />
                        </div>
                      )}
                      <div>
                        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "15px", marginBottom: 4 }}>
                          {file.name}
                        </div>
                        <div style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>
                          {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                          <CheckCircle size={14} color="var(--color-success)" />
                          <span style={{ fontSize: "12px", color: "var(--color-success)", fontWeight: 600 }}>
                            Ready to analyze
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {isProcessing && (
                  <motion.div key="processing"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ padding: "20px 0" }}
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                      style={{ display: "inline-block", marginBottom: 20 }}
                    >
                      <Loader2 size={48} color="var(--color-primary)" />
                    </motion.div>
                    <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700, marginBottom: 8 }}>
                      {state === "uploading" ? "Uploading Report..." : "Analyzing with AI..."}
                    </h3>
                    <p className="animate-pulse-slow" style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
                      {statusMsg}
                    </p>
                    {/* Progress steps */}
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24 }}>
                      {["Upload", "OCR Extract", "AI Analyze", "Dashboard"].map((step, i) => {
                        const active = (state === "uploading" && i === 0) || (state === "analyzing" && i >= 1 && i <= 2);
                        const done = (state === "analyzing" && i === 0);
                        return (
                          <div key={step} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{
                              width: 8, height: 8, borderRadius: "50%",
                              background: done ? "var(--color-success)" : active ? "var(--color-primary)" : "var(--color-border)",
                              transition: "all 0.3s",
                            }} />
                            <span style={{ fontSize: "11px", color: active ? "var(--color-primary)" : "var(--color-text-muted)" }}>
                              {step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {state === "done" && (
                  <motion.div key="done"
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    style={{ padding: "20px 0" }}
                  >
                    <CheckCircle size={56} color="var(--color-success)" style={{ marginBottom: 16 }} />
                    <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "20px", fontWeight: 700, color: "var(--color-success)" }}>
                      Analysis Complete!
                    </h3>
                    <p style={{ color: "var(--color-text-secondary)", marginTop: 8 }}>Redirecting to your dashboard...</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  background: "#FEF2F2", border: "1px solid #FECACA",
                  borderRadius: "var(--radius-md)", padding: "14px 16px", marginTop: 16,
                  color: "#991B1B", fontSize: "14px",
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Analyze Button */}
          {file && !isProcessing && state !== "done" && (
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: 24 }}
            >
              <button
                id="analyze-btn"
                onClick={handleAnalyze}
                className="btn-primary"
                style={{ width: "100%", justifyContent: "center", fontSize: "16px", padding: "16px" }}
              >
                <ArrowRight size={18} />
                Analyze Report
              </button>
            </motion.div>
          )}

          {/* Tips */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            style={{ marginTop: 40, padding: "20px 24px", background: "#F0F9FF", borderRadius: "var(--radius-lg)", border: "1px solid #BAE6FD" }}
          >
            <h4 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "14px", marginBottom: 12, color: "#0C4A6E" }}>
              💡 Tips for best results
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                "Use clear, well-lit photos of physical reports",
                "Ensure the entire page is visible without cropping",
                "Text-based PDFs give the most accurate extraction",
                "Lab reports with tabular data work best",
              ].map((tip) => (
                <li key={tip} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "13px", color: "#0369A1" }}>
                  <span style={{ color: "#0284C7", fontWeight: 700 }}>→</span>
                  {tip}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
