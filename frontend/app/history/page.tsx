"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  History, Clock, FileText, ChevronRight, Loader2, AlertCircle,
  Activity, ArrowRight, Upload, RefreshCw, MapPin
} from "lucide-react";
import axios from "axios";
import Navbar from "@/components/Navbar";
import { getAuthHeaders } from "@/utils/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ReportSummary {
  report_id: number;
  upload_timestamp: string;
  document_url: string;
  overall_health_score: number | null;
  analyzed: boolean;
  is_radiology?: boolean;
  is_cardiac?: boolean;
  is_dicom?: boolean;
  report_type?: string;
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: i * 0.05, ease: "easeOut" }
  })
};

// ── Date formatter helper ────────────────────────────────────────────────────

function formatDate(isoStr: string) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return isoStr;
  }
}

function getFilename(url: string) {
  try {
    return url.split("/").pop() ?? url;
  } catch {
    return url;
  }
}

// ── Score indicator rings ────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        border: "3px dashed var(--color-text-muted)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "10px", fontWeight: 700, color: "var(--color-text-muted)",
        flexShrink: 0
      }}>
        —
      </div>
    );
  }

  const color = score >= 70
    ? "var(--color-success)"
    : score >= 40
    ? "var(--color-warning)"
    : "var(--color-danger)";

  return (
    <div style={{
      width: 44, height: 44, borderRadius: "50%",
      border: `3px solid ${color}`,
      background: color + "10",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-heading)", fontWeight: 800,
      fontSize: "14px", color, flexShrink: 0
    }}>
      {score}
    </div>
  );
}

// ── Dynamic Icons ────────────────────────────────────────────────────────────

function RiskIcon({ score }: { score: number | null }) {
  if (score === null) return <Clock size={11} />;
  return <Activity size={11} />;
}

// ── Main Page Component ──────────────────────────────────────────────────────

export default function HistoryPage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchReports = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await axios.get(`${API_URL}/api/reports`, {
        headers: getAuthHeaders()
      });
      setReports(res.data.reports ?? []);
      setError("");
    } catch (e: any) {
      let msg = e?.response?.data?.detail ?? "Failed to load report history.";
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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  const analyzedReports = reports.filter((r) => r.analyzed);
  const pendingReports = reports.filter((r) => !r.analyzed);
  const avgScore =
    analyzedReports.length > 0
      ? Math.round(
          analyzedReports.reduce((s, r) => s + (r.overall_health_score ?? 0), 0) /
            analyzedReports.length
        )
      : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Navbar />

      {/* ── Page Header ── */}
      <section style={{
        background: "linear-gradient(160deg, #EFF6FF 0%, #F0FDFE 50%, #F5F3FF 100%)",
        padding: "56px 0 60px",
        borderBottom: "1px solid var(--color-border)",
      }}>
        <div className="container">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "#EFF6FF", color: "var(--color-primary)",
              border: "1px solid #BFDBFE",
              borderRadius: "var(--radius-full)", padding: "5px 14px",
              fontSize: "12px", fontWeight: 600, marginBottom: 18,
            }}>
              <History size={12} />
              Report History
            </div>
          </motion.div>
          <motion.h1
            variants={fadeUp} initial="hidden" animate="visible" custom={1}
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(28px, 4vw, 48px)",
              fontWeight: 800, lineHeight: 1.15,
              color: "var(--color-text-primary)",
              marginBottom: 12,
            }}
          >
            Your Analysis <span className="gradient-text">History</span>
          </motion.h1>
          <motion.p
            variants={fadeUp} initial="hidden" animate="visible" custom={2}
            style={{ color: "var(--color-text-secondary)", fontSize: "17px", maxWidth: 520 }}
          >
            All your past medical report uploads and AI analyses — click any card to revisit the full dashboard.
          </motion.p>

          {/* Quick stats */}
          {!loading && reports.length > 0 && (
            <motion.div
              variants={fadeUp} initial="hidden" animate="visible" custom={3}
              style={{ display: "flex", gap: 16, marginTop: 28, flexWrap: "wrap" }}
            >
              {[
                { label: "Total Uploads", value: reports.length, color: "var(--color-primary)", bg: "#EFF6FF" },
                { label: "Analyzed", value: analyzedReports.length, color: "var(--color-success)", bg: "#ECFDF5" },
                { label: "Avg. Health Score", value: avgScore !== null ? `${avgScore}/100` : "—", color: "var(--color-secondary)", bg: "#ECFEFF" },
              ].map((s) => (
                <div key={s.label} style={{
                  background: s.bg, borderRadius: "var(--radius-md)",
                  padding: "12px 20px", border: `1px solid ${s.color}20`,
                }}>
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {s.label}
                  </div>
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "22px", color: s.color, marginTop: 2 }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      {/* ── Content ── */}
      <div className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>

        {/* Top action bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700 }}>
            {loading ? "Loading..." : reports.length === 0 ? "No reports yet" : `${reports.length} Report${reports.length !== 1 ? "s" : ""}`}
          </h2>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => fetchReports(true)}
              disabled={refreshing}
              className="btn-secondary"
              style={{ padding: "9px 18px", fontSize: "13px", opacity: refreshing ? 0.6 : 1 }}
            >
              <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
              Refresh
            </button>
            <Link href="/upload" className="btn-primary" style={{ padding: "9px 18px", fontSize: "13px" }}>
              <Upload size={14} />
              New Upload
            </Link>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 16 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
              <Loader2 size={44} color="var(--color-primary)" />
            </motion.div>
            <p style={{ color: "var(--color-text-secondary)" }}>Loading your report history...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <motion.div variants={fadeUp} initial="hidden" animate="visible"
            style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              background: "#FEF2F2", border: "1px solid #FECACA",
              borderRadius: "var(--radius-lg)", padding: "20px 24px",
              color: "#991B1B",
            }}
          >
            <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, marginBottom: 4 }}>Failed to load history</div>
              <div style={{ fontSize: "14px" }}>{error}</div>
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {!loading && !error && reports.length === 0 && (
          <motion.div
            variants={fadeUp} initial="hidden" animate="visible"
            style={{
              textAlign: "center", padding: "80px 40px",
              background: "var(--color-surface)", borderRadius: "var(--radius-xl)",
              border: "1px solid var(--color-border)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div style={{
              width: 80, height: 80, borderRadius: "var(--radius-lg)",
              background: "#F0F9FF", display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 24px",
            }}>
              <History size={36} color="var(--color-primary)" />
            </div>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "22px", fontWeight: 700, marginBottom: 12 }}>
              No reports yet
            </h3>
            <p style={{ color: "var(--color-text-secondary)", marginBottom: 28, maxWidth: 360, margin: "0 auto 28px" }}>
              Upload your first medical report to get AI-powered insights and see your analysis here.
            </p>
            <Link href="/upload" className="btn-primary" style={{ fontSize: "15px", padding: "14px 28px" }}>
              <Upload size={16} />
              Upload Your First Report
              <ArrowRight size={15} />
            </Link>
          </motion.div>
        )}

        {/* Reports list */}
        {!loading && !error && reports.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {reports.map((r, i) => {
              const isAnalyzed = r.analyzed;
              const score = r.overall_health_score;
              const riskLabel = !isAnalyzed
                ? "Pending"
                : score !== null && score >= 70
                ? "Good Health"
                : score !== null && score >= 40
                ? "Needs Attention"
                : "At Risk";
              const riskColor = !isAnalyzed
                ? "var(--color-text-muted)"
                : score !== null && score >= 70
                ? "var(--color-success)"
                : score !== null && score >= 40
                ? "var(--color-warning)"
                : "var(--color-danger)";
              const riskBg = !isAnalyzed
                ? "#F8FAFC"
                : score !== null && score >= 70
                ? "#ECFDF5"
                : score !== null && score >= 40
                ? "#FFFBEB"
                : "#FEF2F2";

              return (
                <motion.div
                  key={r.report_id}
                  variants={fadeUp} initial="hidden" animate="visible" custom={i}
                  whileHover={{ y: -2, boxShadow: "0 8px 32px rgba(37,99,235,0.10)" }}
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-lg)",
                    padding: "20px 24px",
                    display: "flex", alignItems: "center", gap: 20,
                    boxShadow: "var(--shadow-sm)",
                    transition: "all 0.2s ease",
                    cursor: "default",
                    flexWrap: "wrap",
                  }}
                >
                  {/* Score ring */}
                  <ScoreRing score={isAnalyzed ? score : null} />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{
                        fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "16px",
                        color: "var(--color-text-primary)",
                      }}>
                        Report #{r.report_id}
                      </span>
                      {r.is_radiology && (
                        <span style={{
                          fontSize: "10px", fontWeight: 800, color: "var(--color-primary)",
                          background: "#EFF6FF",
                          border: "1px solid rgba(37,99,235,0.15)",
                          padding: "2px 8px", borderRadius: "10px", textTransform: "uppercase"
                        }}>
                          {r.report_type || "Radiology"} Scan
                        </span>
                      )}
                      {r.is_cardiac && (
                        <span style={{
                          fontSize: "10px", fontWeight: 800, color: "#EF4444",
                          background: "#FEE2E2",
                          border: "1px solid rgba(239,68,68,0.15)",
                          padding: "2px 8px", borderRadius: "10px", textTransform: "uppercase"
                        }}>
                          {r.report_type || "Cardiac"} Report
                        </span>
                      )}
                      {r.is_dicom && (
                        <span style={{
                          fontSize: "10px", fontWeight: 800, color: "var(--color-secondary)",
                          background: "#ECFEFF",
                          border: "1px solid rgba(6,182,212,0.15)",
                          padding: "2px 8px", borderRadius: "10px", textTransform: "uppercase"
                        }}>
                          {r.report_type || "DICOM"} Scan
                        </span>
                      )}
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        background: riskBg, color: riskColor,
                        borderRadius: "var(--radius-full)", padding: "2px 10px",
                        fontSize: "11px", fontWeight: 700, letterSpacing: 0.4,
                      }}>
                        <RiskIcon score={isAnalyzed ? score : null} />
                        {riskLabel}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-muted)", fontSize: "13px", marginBottom: 6 }}>
                      <Clock size={12} />
                      {formatDate(r.upload_timestamp)}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-muted)", fontSize: "12px" }}>
                      <FileText size={12} />
                      <span style={{ fontFamily: "monospace", opacity: 0.7 }}>
                        {getFilename(r.document_url)}
                      </span>
                    </div>
                  </div>

                  {/* Score text (for analyzed) */}
                  {isAnalyzed && score !== null && (
                    <div style={{ textAlign: "center", minWidth: 80 }}>
                      <div style={{
                        fontFamily: "var(--font-heading)", fontWeight: 800,
                        fontSize: "28px", color: riskColor, lineHeight: 1,
                      }}>
                        {score}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: 2 }}>
                        / 100
                      </div>
                    </div>
                  )}

                  {/* Action */}
                  {isAnalyzed ? (
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <Link
                        href={`/recommendations/${r.report_id}`}
                        className="btn-secondary"
                        style={{ padding: "10px 18px", fontSize: "13px" }}
                      >
                        <MapPin size={14} />
                        Find Doctors
                      </Link>
                      <Link
                        href={r.is_radiology ? `/radiology/${r.report_id}` : r.is_cardiac ? `/cardiac/${r.report_id}` : r.is_dicom ? `/dicom/${r.report_id}` : `/dashboard/${r.report_id}`}
                        className="btn-primary"
                        style={{ padding: "10px 18px", fontSize: "13px" }}
                      >
                        View Dashboard
                        <ChevronRight size={14} />
                      </Link>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <Link
                        href={r.is_radiology ? `/radiology/${r.report_id}` : r.is_cardiac ? `/cardiac/${r.report_id}` : r.is_dicom ? `/dicom/${r.report_id}` : "/upload"}
                        className="btn-secondary"
                        style={{ padding: "10px 16px", fontSize: "13px" }}
                      >
                        <Activity size={13} />
                        Analyze
                      </Link>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Bottom CTA if there are reports */}
        {!loading && !error && reports.length > 0 && (
          <motion.div
            variants={fadeUp} initial="hidden" animate="visible"
            viewport={{ once: true }}
            style={{
              marginTop: 40,
              background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)",
              borderRadius: "var(--radius-xl)", padding: "32px 40px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 20,
              boxShadow: "0 12px 40px rgba(37,99,235,0.25)",
            }}
          >
            <div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "20px", color: "#fff", marginBottom: 6 }}>
                Want to track new results?
              </div>
              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "14px" }}>
                Upload another report and get instant AI-powered insights.
              </div>
            </div>
            <Link href="/upload" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#fff", color: "var(--color-primary)",
              borderRadius: "var(--radius-full)", padding: "12px 24px",
              fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "14px",
              textDecoration: "none",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            }}>
              <Upload size={15} />
              Upload New Report
              <ArrowRight size={14} />
            </Link>
          </motion.div>
        )}
      </div>

      {/* Footer */}
      <footer style={{
        background: "var(--color-text-primary)", color: "rgba(255,255,255,0.6)",
        padding: "32px 0", textAlign: "center", fontSize: "13px",
      }}>
        <div className="container">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
            <Activity size={16} color="#2563EB" />
            <span style={{ fontFamily: "var(--font-heading)", color: "#fff", fontWeight: 700 }}>MediScan AI</span>
          </div>
          <p>⚠️ For demonstration purposes only. Not a substitute for professional medical advice.</p>
        </div>
      </footer>
    </div>
  );
}
