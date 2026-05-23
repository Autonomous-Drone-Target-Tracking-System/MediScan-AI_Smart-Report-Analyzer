"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Activity, Upload, History, Menu, X, TrendingUp, LogOut, ShieldCheck, Mic, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { clearSession, getUserSession, isAuthenticated } from "@/utils/auth";

export default function Navbar() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Hydrate auth status client-side only to avoid SSR mismatches
  useEffect(() => {
    setLoggedIn(isAuthenticated());
    setSession(getUserSession());
  }, []);

  const handleLogout = () => {
    clearSession();
    setLoggedIn(false);
    setSession(null);
    router.push("/login");
  };

  const links = [
    { href: "/upload", label: "Upload Report", icon: <Upload size={16} /> },
    { href: "/history", label: "History", icon: <History size={16} /> },
    { href: "/assistant", label: "Sofia Voice AI", icon: <Mic size={16} /> },
    { href: "/enterprise", label: "Sofia Enterprise", icon: <Building2 size={16} /> },
  ];

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: scrolled
          ? "rgba(255, 255, 255, 0.95)"
          : "rgba(255, 255, 255, 0.80)",
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${scrolled ? "var(--color-border)" : "transparent"}`,
        transition: "all 0.3s ease",
        boxShadow: scrolled ? "var(--shadow-sm)" : "none",
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "72px",
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "10px",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Activity size={20} color="#fff" />
          </div>
          <div>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 700,
                fontSize: "16px",
                color: "var(--color-text-primary)",
                lineHeight: 1.2,
              }}
            >
              MediScan AI
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-text-muted)",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 4
              }}
            >
              <ShieldCheck size={11} color="#059669" />
              HIPAA Protected
            </div>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
          className="desktop-nav"
        >
          {loggedIn && links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-full)",
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                textDecoration: "none",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.color = "var(--color-primary)";
                (e.target as HTMLElement).style.background = "#EFF6FF";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.color = "var(--color-text-secondary)";
                (e.target as HTMLElement).style.background = "transparent";
              }}
            >
              {link.label}
            </Link>
          ))}

          {/* Secure Profile / Login actions */}
          {loggedIn ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 12, borderLeft: "1px solid #E2E8F0" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1E293B" }}>
                  {session?.isGuest ? "Guest Sandbox" : session?.email ? session.email.split("@")[0] : "Profile"}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: session?.isGuest ? "#FFF7ED" : "#ECFDF5",
                    color: session?.isGuest ? "#C2410C" : "#047857",
                    border: session?.isGuest ? "1px solid #FFEDD5" : "1px solid #D1FAE5"
                  }}
                >
                  {session?.role === "doctor" ? "Clinician" : session?.isGuest ? "Temporary" : "Patient"}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  background: "#F1F5F9",
                  border: "1px solid #E2E8F0",
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748B",
                  cursor: "pointer",
                  transition: "all 0.15s"
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#FEF2F2";
                  (e.currentTarget as HTMLElement).style.color = "#EF4444";
                  (e.currentTarget as HTMLElement).style.borderColor = "#FEE2E2";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#F1F5F9";
                  (e.currentTarget as HTMLElement).style.color = "#64748B";
                  (e.currentTarget as HTMLElement).style.borderColor = "#E2E8F0";
                }}
                title="Logout Securely"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="btn-primary"
              style={{
                padding: "10px 22px",
                fontSize: "14px",
                fontWeight: 700,
                boxShadow: "0 4px 14px rgba(37, 99, 235, 0.25)"
              }}
            >
              Access Portal
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            display: "none",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 8,
          }}
          className="mobile-menu-btn"
          aria-label="Toggle menu"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              background: "#fff",
              borderTop: "1px solid var(--color-border)",
              padding: "16px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {loggedIn ? (
              <>
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "var(--radius-md)",
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {link.icon}
                    {link.label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    handleLogout();
                  }}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "var(--radius-md)",
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "#EF4444",
                    background: "#FEF2F2",
                    border: "none",
                    width: "100%",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer"
                  }}
                >
                  <LogOut size={16} />
                  Logout Securely
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                style={{
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "#fff",
                  textDecoration: "none",
                  textAlign: "center",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))"
                }}
              >
                Access Portal
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </nav>
  );
}
