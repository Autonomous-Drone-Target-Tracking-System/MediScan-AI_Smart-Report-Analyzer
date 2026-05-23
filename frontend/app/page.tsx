"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Upload, Zap, ShieldCheck, Brain, ArrowRight, FileText,
  Activity, TrendingUp, CheckCircle2
} from "lucide-react";
import Navbar from "@/components/Navbar";

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.12, ease: "easeOut" },
  }),
};

const FEATURES = [
  {
    icon: <FileText size={28} />,
    title: "Smart OCR Extraction",
    desc: "PaddleOCR + Tesseract accurately extract text from any PDF or photo of your medical report — even scanned documents.",
    color: "#2563EB",
    bg: "#EFF6FF",
  },
  {
    icon: <Brain size={28} />,
    title: "AI Interpretation",
    desc: "GPT-powered explanations convert dense medical jargon into simple, plain-English insights anyone can understand.",
    color: "#06B6D4",
    bg: "#ECFEFF",
  },
  {
    icon: <Activity size={28} />,
    title: "Risk Dashboard",
    desc: "Instantly see your health score, color-coded risk indicators, and which biomarkers need your attention most.",
    color: "#10B981",
    bg: "#ECFDF5",
  },
  {
    icon: <ShieldCheck size={28} />,
    title: "Rule-Based Validation",
    desc: "AI explanations are grounded by a clinical reference ranges engine — reducing hallucinations for safer insights.",
    color: "#F59E0B",
    bg: "#FFFBEB",
  },
  {
    icon: <Zap size={28} />,
    title: "Results in Seconds",
    desc: "From upload to full analysis dashboard in under 15 seconds — optimized for speed without sacrificing accuracy.",
    color: "#8B5CF6",
    bg: "#F5F3FF",
  },
  {
    icon: <TrendingUp size={28} />,
    title: "30+ Biomarkers",
    desc: "Hemoglobin, LDL, Blood Sugar, TSH, Vitamin D, Creatinine and many more — all automatically detected and assessed.",
    color: "#EF4444",
    bg: "#FEF2F2",
  },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Upload Your Report", desc: "Drag & drop or select a PDF or image of your medical report." },
  { step: "02", title: "OCR Extracts Data", desc: "Our AI reads and extracts all biomarkers and numerical values." },
  { step: "03", title: "Risk is Classified", desc: "Each marker is compared against clinical normal ranges." },
  { step: "04", title: "AI Explains Results", desc: "GPT generates plain-English explanations and recommendations." },
];

const STATS = [
  { value: "30+", label: "Biomarkers Tracked" },
  { value: "<15s", label: "Analysis Time" },
  { value: "99%", label: "Format Support" },
  { value: "Free", label: "For Hackathon Demo" },
];

export default function LandingPage() {
  return (
    <div style={{ background: "var(--color-bg)", minHeight: "100vh" }}>
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "100px 0 120px",
          background: "linear-gradient(160deg, #EFF6FF 0%, #F0FDFE 50%, #ECFDF5 100%)",
        }}
      >
        {/* Background blobs */}
        <div style={{
          position: "absolute", top: -100, right: -100,
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -80, left: -80,
          width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div className="container" style={{ textAlign: "center", position: "relative" }}>
          {/* Badge */}
          <motion.div
            variants={fadeUp} initial="hidden" animate="visible" custom={0}
          >
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "#EFF6FF", color: "var(--color-primary)",
              border: "1px solid #BFDBFE",
              borderRadius: "var(--radius-full)", padding: "6px 16px",
              fontSize: "13px", fontWeight: 600, marginBottom: 24,
            }}>
              <Zap size={13} fill="currentColor" />
              AI-Powered · Smart Medical Report Analyzer 
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp} initial="hidden" animate="visible" custom={1}
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(36px, 6vw, 68px)",
              fontWeight: 800,
              lineHeight: 1.1,
              color: "var(--color-text-primary)",
              maxWidth: 860,
              margin: "0 auto 24px",
            }}
          >
            Understand Medical Reports{" "}
            <span className="gradient-text">Instantly with AI</span>
          </motion.h1>

          <motion.p
            variants={fadeUp} initial="hidden" animate="visible" custom={2}
            style={{
              fontSize: "clamp(16px, 2vw, 20px)",
              color: "var(--color-text-secondary)",
              maxWidth: 600,
              margin: "0 auto 40px",
              lineHeight: 1.7,
            }}
          >
            Upload your blood test or health report and get AI-powered insights in seconds.
            No medical degree required, just clarity.
          </motion.p>

          <motion.div
            variants={fadeUp} initial="hidden" animate="visible" custom={3}
            style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}
          >
            <Link href="/upload" className="btn-primary" style={{ fontSize: "16px", padding: "16px 32px" }}>
              <Upload size={18} />
              Analyze My Report
              <ArrowRight size={16} />
            </Link>
            <a href="#how-it-works" className="btn-secondary" style={{ fontSize: "16px", padding: "16px 32px" }}>
              See How It Works
            </a>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            variants={fadeUp} initial="hidden" animate="visible" custom={4}
            style={{
              marginTop: 48,
              display: "flex",
              justifyContent: "center",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            {["PDF & Image Support", "30+ Biomarkers", "No Sign-up Required", "Results in <15s"].map((item) => (
              <span key={item} style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: "13px", color: "var(--color-text-secondary)",
              }}>
                <CheckCircle2 size={14} color="var(--color-success)" fill="var(--color-success)" style={{ opacity: 0.8 }} />
                {item}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Stats Bar ────────────────────────────────────────────────────── */}
      <section style={{ background: "var(--color-primary)", padding: "40px 0" }}>
        <div className="container">
          <div className="stats-grid" style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 24,
            textAlign: "center",
          }}>
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                variants={fadeUp} initial="hidden" whileInView="visible"
                viewport={{ once: true, amount: 0 }} custom={i}
              >
                <div style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, color: "#fff", fontFamily: "var(--font-heading)" }}>
                  {s.value}
                </div>
                <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.75)", marginTop: 4 }}>
                  {s.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        <style>{`@media(max-width:640px){.container > div{grid-template-columns:repeat(2,1fr)!important}}`}</style>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section id="features" className="section">
        <div className="container">
          <motion.div
            variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0 }} style={{ textAlign: "center", marginBottom: 56 }}
          >
            <div style={{
              display: "inline-block",
              background: "#ECFDF5", color: "var(--color-success)",
              borderRadius: "var(--radius-full)", padding: "6px 16px",
              fontSize: "13px", fontWeight: 600, marginBottom: 16,
            }}>
              What We Offer
            </div>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 700, marginBottom: 16 }}>
              Everything You Need to{" "}
              <span className="gradient-text">Understand Your Health</span>
            </h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "17px", maxWidth: 560, margin: "0 auto" }}>
              From raw medical PDF to clear health dashboard, all powered by AI, no expertise needed.
            </p>
          </motion.div>

          <div className="grid-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                variants={fadeUp} initial="hidden" whileInView="visible"
                viewport={{ once: true, amount: 0 }} custom={i % 3}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                style={{
                  background: "var(--color-surface)",
                  borderRadius: "var(--radius-lg)",
                  padding: "28px",
                  border: "1px solid var(--color-border)",
                  boxShadow: "var(--shadow-md)",
                  cursor: "default",
                }}
              >
                <div style={{
                  width: 56, height: 56, borderRadius: "var(--radius-md)",
                  background: f.bg, color: f.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 20,
                }}>
                  {f.icon}
                </div>
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700, marginBottom: 10 }}>
                  {f.title}
                </h3>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", lineHeight: 1.7 }}>
                  {f.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="section" style={{ background: "linear-gradient(135deg, #F0F9FF 0%, #F0FDF4 100%)" }}>
        <div className="container">
          <motion.div
            variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0 }} style={{ textAlign: "center", marginBottom: 56 }}
          >
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 700, marginBottom: 16 }}>
              How It <span className="gradient-text">Works</span>
            </h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "17px" }}>
              Four simple steps from report to insight.
            </p>
          </motion.div>

          <div className="how-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
            {HOW_IT_WORKS.map((step, i) => (
              <motion.div
                key={step.step}
                variants={fadeUp} initial="hidden" whileInView="visible"
                viewport={{ once: true, amount: 0 }} custom={i * 0.8}
                style={{ textAlign: "center", position: "relative" }}
              >
                {/* Connector line */}
                {i < HOW_IT_WORKS.length - 1 && (
                  <div style={{
                    position: "absolute", top: 28, left: "60%", right: "-40%",
                    height: 2,
                    background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))",
                    opacity: 0.3,
                  }} />
                )}
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 20px",
                  fontFamily: "var(--font-heading)", fontWeight: 800,
                  fontSize: "16px", color: "#fff",
                  boxShadow: "0 4px 16px rgba(37,99,235,0.3)",
                  position: "relative", zIndex: 1,
                }}>
                  {step.step}
                </div>
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "16px", fontWeight: 700, marginBottom: 8 }}>
                  {step.title}
                </h3>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", lineHeight: 1.6 }}>
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </div>

          <style>{`@media(max-width:768px){section #how-it-works div[style*="grid-template-columns"]{grid-template-columns:repeat(2,1fr)!important}}`}</style>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────────── */}
      <section className="section">
        <div className="container">
          <motion.div
            variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0 }}
            style={{
              background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)",
              borderRadius: "var(--radius-xl)",
              padding: "64px 48px",
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(37,99,235,0.30)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{
              position: "absolute", top: -60, right: -60,
              width: 300, height: 300, borderRadius: "50%",
              background: "rgba(255,255,255,0.06)",
            }} />
            <h2 style={{
              fontFamily: "var(--font-heading)", fontSize: "clamp(26px, 4vw, 40px)",
              fontWeight: 800, color: "#fff", marginBottom: 16, position: "relative",
            }}>
              Ready to Understand Your Health?
            </h2>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "18px", marginBottom: 36, position: "relative" }}>
              Upload your medical report now free, instant, and no sign-up required.
            </p>
            <Link
              href="/upload"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "#fff", color: "var(--color-primary)",
                borderRadius: "var(--radius-full)", padding: "16px 36px",
                fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "16px",
                textDecoration: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                transition: "all 0.25s",
                position: "relative",
              }}
            >
              <Upload size={18} />
              Analyze My Report
              <ArrowRight size={16} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{
        background: "var(--color-text-primary)",
        color: "rgba(255,255,255,0.6)",
        padding: "40px 0",
        textAlign: "center",
        fontSize: "14px",
      }}>
        <div className="container">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
            <Activity size={18} color="#2563EB" />
            <span style={{ fontFamily: "var(--font-heading)", color: "#fff", fontWeight: 700 }}>MediScan AI</span>
          </div>
          <p>Smart Medical Report Analyzer — HackXcelerate 2K26</p>
          <p style={{ marginTop: 4 }}>
            ⚠️ For demonstration purposes only. Not a substitute for professional medical advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
