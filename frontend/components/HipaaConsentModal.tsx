"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Shield, FileCheck, HelpCircle, LogOut } from "lucide-react";
import { clearSession, getAuthHeaders, setConsentStatus } from "@/utils/auth";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface HipaaConsentModalProps {
  onConsentGranted: () => void;
}

export default function HipaaConsentModal({ onConsentGranted }: HipaaConsentModalProps) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!agreed) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/consent`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ consent_given: true })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Consent submission rejected by server.");
      }

      // Update local storage status
      setConsentStatus(true);
      onConsentGranted();
    } catch (err: any) {
      setError(err.message || "Failed to persist electronic consent status.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 6, 23, 0.8)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 9999,
        fontFamily: "var(--font-inter), sans-serif",
        color: "#F8FAFC"
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        style={{
          width: "100%",
          maxWidth: 580,
          background: "#0F172A",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 20,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 20
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "rgba(37, 99, 235, 0.15)",
              border: "1px solid rgba(37, 99, 235, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            <Shield size={22} color="#3B82F6" />
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>HIPAA Compliance Disclosure</h3>
            <p style={{ fontSize: 12, color: "#94A3B8" }}>Electronic Data Processing & Consent Agreement</p>
          </div>
        </div>

        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.04)",
            borderRadius: 12,
            padding: 16,
            fontSize: 12.5,
            lineHeight: 1.6,
            color: "#CBD5E1",
            maxHeight: 250,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 12
          }}
        >
          <p>
            MediScan AI enforces compliance directives under the **Health Insurance Portability and Accountability Act (HIPAA)** to safeguard Protected Health Information (PHI).
          </p>
          <p>
            <strong>1. Secure Encryption at Rest:</strong> All uploaded medical PDF or image reports are encrypted using AES symmetric algorithms before they touch database cells or physical disk storage.
          </p>
          <p>
            <strong>2. Secure Transit & Memory Sandboxes:</strong> Network communications are encrypted via SSL/TLS tunnels. Report text extraction processes (OCR) execute inside dynamic memory sandboxes, completely wiping decrypted files (using secure data-shredding) immediately upon completion.
          </p>
          <p>
            <strong>3. Persistent Trace Audits:</strong> HIPAA mandates recording a secure audit log for all clinical events. System interactions—such as viewing reports, chatting with AI context, or comparing wellness markers—are persistently cataloged with timestamps, action identifiers, and credentials.
          </p>
          <p>
            <strong>4. Automated Shredding:</strong> For temporary guest profiles, records are automatically purged and shredded after 24 hours of inactivity.
          </p>
          <p>
            By granting consent below, you authorize MediScan AI to perform clinical parsing, store encrypted health reports, and generate AI insights on your behalf.
          </p>
        </div>

        {error && (
          <div style={{ color: "#FCA5A5", fontSize: 12.5, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8, padding: "8px 12px" }}>
            {error}
          </div>
        )}

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            cursor: "pointer",
            background: "rgba(255,255,255,0.02)",
            padding: 14,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.04)",
            transition: "all 0.15s"
          }}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 2, accentColor: "#2563EB", cursor: "pointer" }}
          />
          <span style={{ fontSize: 12, lineHeight: 1.5, color: agreed ? "#FFF" : "#94A3B8" }}>
            I agree to the electronic processing and encrypted storage of my Protected Health Information (PHI) under MediScan AI HIPAA disclosures.
          </span>
        </label>

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={handleDecline}
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              padding: "11px 16px",
              color: "#94A3B8",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.15s"
            }}
          >
            <LogOut size={16} />
            Decline & Logout
          </button>
          <button
            type="button"
            disabled={!agreed || submitting}
            onClick={handleSubmit}
            style={{
              flex: 1.4,
              background: agreed ? "linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)" : "rgba(255,255,255,0.04)",
              border: "none",
              borderRadius: 10,
              padding: "11px 16px",
              color: agreed ? "#FFF" : "#64748B",
              fontSize: 13,
              fontWeight: 700,
              cursor: agreed ? "pointer" : "not-allowed",
              boxShadow: agreed ? "0 4px 14px rgba(37, 99, 235, 0.3)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.15s"
            }}
          >
            <FileCheck size={16} />
            {submitting ? "Signing..." : "Agree & Grant Consent"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
