"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Key, Mail, ArrowRight, UserCheck, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { setAccessToken, setUserSession, clearSession, isAuthenticated } from "@/utils/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("patient");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Clear existing session on loading login page
  useEffect(() => {
    clearSession();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const path = activeTab === "login" ? "/api/auth/login" : "/api/auth/register";
    const body = activeTab === "login"
      ? { email, password }
      : { email, password, role };

    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Authentication request failed.");
      }

      if (activeTab === "register") {
        setSuccess("Account created successfully! Please log in.");
        setActiveTab("login");
        setPassword("");
      } else {
        // Logged in
        setAccessToken(data.access_token);
        
        // Load user profile information
        const profileRes = await fetch(`${API_URL}/api/auth/me`, {
          headers: { "Authorization": `Bearer ${data.access_token}` }
        });
        const profile = await profileRes.json();

        setUserSession({
          userId: profile.user_id,
          email: profile.email,
          role: profile.role,
          consentGiven: profile.consent_given,
          consentTimestamp: profile.consent_timestamp,
          isGuest: profile.is_guest,
          expiresAt: profile.expires_at
        });

        // Forward to upload
        router.push("/upload");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected security exception occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleGuestMode = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/guest`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Guest mode creation failed.");
      }

      setAccessToken(data.access_token);
      setUserSession({
        userId: data.user_id || 999, // default placeholder handled on backend
        email: `guest_${data.expires_at ? data.expires_at.slice(-8) : "session"}@mediscan.local`,
        role: "patient",
        consentGiven: false,
        consentTimestamp: null,
        isGuest: true,
        expiresAt: data.expires_at
      });

      router.push("/upload");
    } catch (err: any) {
      setError(err.message || "Failed to initialize secure guest sandbox.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: "radial-gradient(circle at 50% 50%, #0F172A 0%, #020617 100%)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "var(--font-inter), sans-serif",
        color: "#F8FAFC",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* Background elements */}
      <div style={{ position: "absolute", top: "10%", left: "15%", width: 300, height: 300, background: "radial-gradient(circle, rgba(37,99,235,0.15) 0%, transparent 70%)", borderRadius: "50%" }} />
      <div style={{ position: "absolute", bottom: "10%", right: "15%", width: 350, height: 350, background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)", borderRadius: "50%" }} />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 24,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255,255,255,0.05)",
          padding: "36px 32px",
          position: "relative",
          zIndex: 10
        }}
      >
        {/* Brand header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg, #2563EB, #06B6D4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              boxShadow: "0 4px 14px rgba(37, 99, 235, 0.3)"
            }}
          >
            <Shield size={24} color="#FFF" />
          </div>
          <h2 style={{ fontFamily: "var(--font-poppins)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px" }}>
            MediScan <span style={{ color: "#3B82F6" }}>Secure Portal</span>
          </h2>
          <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>
            HIPAA-aware protected health information analyzer
          </p>
        </div>

        {/* Guest Mode Direct Sandbox Button */}
        <button
          type="button"
          onClick={handleGuestMode}
          disabled={loading}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            borderRadius: 12,
            padding: "12px 16px",
            color: "#FFF",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            boxShadow: "0 4px 12px rgba(30, 64, 175, 0.2)",
            transition: "all 0.2s",
            marginBottom: 20
          }}
        >
          <UserCheck size={16} />
          {loading ? "Initializing..." : "Quick Guest Mode (24h Retention)"}
          <ArrowRight size={14} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0", opacity: 0.6 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>Or clinical credentials</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
        </div>

        {/* Tab switchers */}
        <div style={{ display: "flex", background: "rgba(255, 255, 255, 0.04)", padding: 4, borderRadius: 10, marginBottom: 20 }}>
          {["login", "register"].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab as any);
                setError(null);
                setSuccess(null);
              }}
              style={{
                flex: 1,
                padding: "8px 16px",
                border: "none",
                borderRadius: 8,
                background: activeTab === tab ? "rgba(255, 255, 255, 0.08)" : "transparent",
                color: activeTab === tab ? "#FFF" : "#94A3B8",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "all 0.15s"
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Feedback alerts */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 13,
                color: "#FCA5A5",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 8
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 13,
                color: "#A7F3D0",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 8
              }}
            >
              <UserCheck size={16} style={{ flexShrink: 0 }} />
              <span>{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Email input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8" }}>Email Address</label>
            <div style={{ position: "relative" }}>
              <Mail size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#64748B" }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@hospital.com"
                style={{
                  width: "100%",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 10,
                  padding: "11px 16px 11px 40px",
                  color: "#FFF",
                  fontSize: 13.5,
                  outline: "none"
                }}
              />
            </div>
          </div>

          {/* Password input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8" }}>Password</label>
            <div style={{ position: "relative" }}>
              <Key size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#64748B" }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 10,
                  padding: "11px 16px 11px 40px",
                  color: "#FFF",
                  fontSize: 13.5,
                  outline: "none"
                }}
              />
            </div>
          </div>

          {/* Role selector (only during registration) */}
          {activeTab === "register" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8" }}>Healthcare Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{
                  width: "100%",
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 10,
                  padding: "11px 16px",
                  color: "#FFF",
                  fontSize: 13.5,
                  outline: "none"
                }}
              >
                <option value="patient">Patient (View personal data)</option>
                <option value="doctor">Clinician (Doctor / Nurse RBAC)</option>
              </select>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: "linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)",
              border: "none",
              borderRadius: 10,
              padding: "12px 16px",
              color: "#FFF",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(37, 99, 235, 0.3)",
              transition: "all 0.15s",
              marginTop: 10
            }}
          >
            {loading ? "Authenticating..." : activeTab === "login" ? "Access Secure Dashboard" : "Register Credentials"}
          </button>
        </form>

        {/* HIPAA compliance notice badge */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 24, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <Shield size={16} color="#06B6D4" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11, lineHeight: 1.4, color: "#94A3B8" }}>
            <strong>HIPAA Safety & Disclosures:</strong> This portal enforces end-to-end AES-256 encryption at rest, secure SSL/TLS channels in transit, persistent clinical audit logging databases, and immediate data shredding for guest assets.
          </div>
        </div>
      </motion.div>
    </div>
  );
}
