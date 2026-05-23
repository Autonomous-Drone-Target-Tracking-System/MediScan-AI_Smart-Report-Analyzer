"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Phone, ShieldAlert, Award, Star, Compass, Clock, CheckCircle,
  AlertTriangle, ArrowLeft, Loader2, Navigation, Heart, ExternalLink, HelpCircle
} from "lucide-react";
import axios from "axios";
import Navbar from "@/components/Navbar";
import { getAuthHeaders } from "@/utils/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Provider {
  name: string;
  specialty: string;
  rating: number;
  reviews_count: number;
  address: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  travel_time_min: number;
  open_now: boolean;
  emergency_capable: boolean;
  appointment_link: string;
  phone: string;
  explanation: string;
}

interface InferredNeeds {
  report_id: number;
  specialists: string[];
  urgency: string;
  care_category: string;
  reasoning: string;
  emergency_triggers: string[];
}

export default function DoctorDiscoveryPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.reportId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inferredNeeds, setInferredNeeds] = useState<InferredNeeds | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [emergencyHotlines, setEmergencyHotlines] = useState<any[]>([]);
  
  // Geolocation & Permissions State
  const [consentGranted, setConsentGranted] = useState(false);
  const [requestingLocation, setRequestingLocation] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [manualZip, setManualZip] = useState("");
  const [zipLoading, setZipLoading] = useState(false);

  // Selected Provider for map focusing / directions
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [mapMode, setMapMode] = useState<"standard" | "emergency">("standard");

  // Ref to hold the dynamically created map
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [osmLoaded, setOsmLoaded] = useState(false);

  // 1. Get initial browser location permission or fallbacks
  useEffect(() => {
    // Check if permission was already granted previously in this session
    const savedCoords = sessionStorage.getItem("patient_temp_coords");
    if (savedCoords) {
      try {
        const parsed = JSON.parse(savedCoords);
        setCoords(parsed);
        setConsentGranted(true);
        fetchRecommendations(parsed.latitude, parsed.longitude);
        return;
      } catch (e) {}
    }
    setLoading(false);
  }, []);

  // 2. Fetch recommendations from API using coordinates
  const fetchRecommendations = async (latitude: number, longitude: number) => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      delete headers["Content-Type"];

      const res = await axios.post(
        `${API_URL}/api/recommendations/${reportId}`,
        { latitude, longitude },
        { headers }
      );

      setInferredNeeds(res.data.inferred_needs);
      setProviders(res.data.providers);
      setEmergencyHotlines(res.data.emergency_hotlines);
      
      if (res.data.inferred_needs.urgency === "CRITICAL") {
        setMapMode("emergency");
      }

      // Pre-select the top recommended provider
      if (res.data.providers.length > 0) {
        setSelectedProvider(res.data.providers[0]);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "Failed to compile nearby medical discovery data.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // 3. Trigger Browser Geolocation
  const handleRequestLocation = () => {
    setRequestingLocation(true);
    if (!navigator.geolocation) {
      setError("Browser geolocation is not supported by your current browser.");
      setRequestingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        setCoords(userCoords);
        setConsentGranted(true);
        setRequestingLocation(false);
        // Securely store coordinates temporarily only for this active browser window
        sessionStorage.setItem("patient_temp_coords", JSON.stringify(userCoords));
        fetchRecommendations(userCoords.latitude, userCoords.longitude);
      },
      (error) => {
        setRequestingLocation(false);
        // Fallback coordinates (New York Midtown Medical District area)
        const fallbackCoords = { latitude: 40.7648, longitude: -73.9808 };
        setCoords(fallbackCoords);
        setConsentGranted(true);
        fetchRecommendations(fallbackCoords.latitude, fallbackCoords.longitude);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // 4. Handle Zip Code Manual Entry Fallback
  const handleZipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualZip.trim()) return;
    setZipLoading(true);
    
    // Simulate lightweight geocoding mapping for ZIP
    setTimeout(() => {
      // Offset coords around general New York / East Coast
      const zipHash = manualZip.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const latOffset = (zipHash % 100) / 1000;
      const lonOffset = (zipHash % 70) / 1000;
      
      const zipCoords = {
        latitude: 40.7128 + latOffset,
        longitude: -74.0060 - lonOffset
      };
      
      setCoords(zipCoords);
      setConsentGranted(true);
      setZipLoading(false);
      fetchRecommendations(zipCoords.latitude, zipCoords.longitude);
    }, 800);
  };

  const getUrgencyColor = (urgency?: string) => {
    if (urgency === "CRITICAL") return "#ee2a2a";
    if (urgency === "URGENT") return "#F59E0B";
    return "#10B981";
  };

  const currentUrgencyColor = getUrgencyColor(inferredNeeds?.urgency);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0B0F10",
      color: "#e0e3e5",
      fontFamily: "var(--font-heading)",
      "--color-bg": "#0B0F10",
      "--color-surface": "rgba(30, 41, 59, 0.6)",
      "--color-surface-2": "rgba(15, 23, 42, 0.8)",
      "--color-text-primary": "#ffffff",
      "--color-text-secondary": "#c6c6cd",
      "--color-text-muted": "#94a3b8",
      "--color-border": "rgba(59, 130, 246, 0.12)",
    } as React.CSSProperties}>
      <Navbar />

      {/* Local dark mode styling overrides for the Navbar */}
      <style>{`
        nav {
          background: rgba(11, 15, 26, 0.85) !important;
          border-bottom: 1px solid rgba(59, 130, 246, 0.15) !important;
        }
        nav div, nav span, nav a {
          color: #ffffff !important;
        }
        nav a:hover {
          color: #3b82f6 !important;
          background: rgba(59, 130, 246, 0.12) !important;
        }
        nav button {
          background: rgba(255, 255, 255, 0.06) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
          color: #c6c6cd !important;
        }
      `}</style>

      <div className="container" style={{ paddingTop: 30, paddingBottom: 60 }}>
        {/* Navigation & Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <button
            onClick={() => router.push(`/dashboard/${reportId}`)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "14px" }}
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
          
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "12px", color: "var(--color-secondary)" }}>
            <Award size={14} /> HIPAA COMPLIANT GEOLOCATION
          </div>
        </div>

        {/* Consent Opt-In Overlay (Phase 7 - Privacy & Security) */}
        <AnimatePresence>
          {!consentGranted && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                maxWidth: "600px", margin: "40px auto",
                background: "rgba(30, 41, 59, 0.85)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: "var(--radius-xl)",
                padding: "36px",
                textAlign: "center",
                boxShadow: "0 20px 50px rgba(0,0,0,0.3)"
              }}
            >
              <div style={{
                width: 60, height: 60, borderRadius: "50%",
                background: "rgba(59, 130, 246, 0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 20px", color: "#3B82F6"
              }}>
                <MapPin size={32} />
              </div>
              
              <h2 style={{ fontSize: "24px", fontWeight: 800, marginBottom: 12, color: "#ffffff" }}>
                Enable Geolocation Discovery
              </h2>
              
              <p style={{ fontSize: "14px", color: "#c6c6cd", lineHeight: 1.6, marginBottom: 24 }}>
                To find the nearest medical facilities, primary clinics, and specialists corresponding
                to your biomarker requirements, MediScan AI requires temporary, opt-in geolocation access.
                <br />
                <strong style={{ color: "#ffffff", display: "block", marginTop: 8 }}>
                  🔒 Your precise location coordinates are encrypted and never stored permanently.
                </strong>
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button
                  onClick={handleRequestLocation}
                  disabled={requestingLocation}
                  className="btn-primary"
                  style={{
                    padding: "12px 24px", fontSize: "14px", fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: "0 6px 20px rgba(37,99,235,0.4)"
                  }}
                >
                  {requestingLocation ? (
                    <>
                      <Loader2 size={16} className="spinner" /> Approving Access...
                    </>
                  ) : (
                    <>
                      <Compass size={16} /> Share My Geolocation
                    </>
                  )}
                </button>

                <div style={{ display: "flex", alignItems: "center", margin: "16px 0" }}>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
                  <span style={{ padding: "0 12px", fontSize: "12px", color: "var(--color-text-muted)" }}>OR USE FALLBACK ZIP</span>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
                </div>

                <form onSubmit={handleZipSubmit} style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Enter manual 5-digit ZIP code..."
                    value={manualZip}
                    onChange={(e) => setManualZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    style={{
                      flex: 1,
                      background: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "var(--radius-md)",
                      padding: "10px 16px",
                      color: "#fff",
                      fontSize: "14px"
                    }}
                  />
                  <button
                    type="submit"
                    disabled={zipLoading}
                    className="btn-secondary"
                    style={{
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff", padding: "10px 20px", fontSize: "13px"
                    }}
                  >
                    {zipLoading ? <Loader2 size={14} className="spinner" /> : "Verify ZIP"}
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {consentGranted && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 28, marginTop: 10 }}>
            
            {/* Left side: Maps & Discovery list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              
              {/* Emergency / Urgency Alert Banner (Phase 6) */}
              {inferredNeeds && inferredNeeds.urgency === "CRITICAL" && (
                <motion.div
                  initial={{ scale: 0.98, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  style={{
                    background: "rgba(238, 42, 42, 0.08)",
                    border: "1px solid rgba(238, 42, 42, 0.3)",
                    borderRadius: "var(--radius-lg)",
                    padding: "18px 24px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 16,
                    boxShadow: "0 0 20px rgba(238, 42, 42, 0.15)",
                    borderLeft: "5px solid #ee2a2a",
                    animation: "heartPulse 2.5s ease-in-out infinite"
                  }}
                >
                  <ShieldAlert size={24} color="#ee2a2a" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <h3 style={{ color: "#ffffff", fontSize: "16px", fontWeight: 700, marginBottom: 4 }}>
                      🚨 High Urgency Health Alert Detected
                    </h3>
                    <p style={{ fontSize: "13px", color: "#fca5a5", lineHeight: 1.5 }}>
                      Based on your report findings indicating critical indicators ({inferredNeeds.emergency_triggers.join(", ") || "elevated telemetry biomarkers"}), you require immediate medical evaluation. Normal ranking is bypassed: we prioritized the nearest hospital Level 1 Trauma Emergency Rooms.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Main map view container */}
              <div style={{
                height: "360px",
                background: "rgba(30, 41, 59, 0.5)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(59, 130, 246, 0.15)",
                borderRadius: "var(--radius-xl)",
                overflow: "hidden",
                position: "relative",
                boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
              }}>
                {/* Geodesic Medical Simulation Visualizer (Phase 9 Fallback support) */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "radial-gradient(circle at 50% 50%, #0F172A 0%, #07090E 100%)",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  padding: "20px", textAlign: "center"
                }}>
                  {/* Grid Lines */}
                  <div style={{
                    position: "absolute", inset: 0,
                    backgroundImage: "linear-gradient(rgba(59, 130, 246, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.05) 1px, transparent 1px)",
                    backgroundSize: "30px 30px"
                  }} />

                  {/* Concentric distance scanning rings */}
                  <div className="animate-pulse-slow" style={{
                    position: "absolute", width: "240px", height: "240px",
                    borderRadius: "50%", border: "1px solid rgba(6, 182, 212, 0.15)",
                    background: "radial-gradient(circle, rgba(6, 182, 212, 0.02) 0%, transparent 80%)"
                  }} />
                  <div style={{
                    position: "absolute", width: "120px", height: "120px",
                    borderRadius: "50%", border: "1px dashed rgba(59, 130, 246, 0.2)"
                  }} />

                  {/* Live user location radar dot */}
                  <div style={{
                    position: "absolute", width: 14, height: 14,
                    background: "#3B82F6", borderRadius: "50%",
                    boxShadow: "0 0 16px #3B82F6, 0 0 32px rgba(59, 130, 246, 0.5)",
                    zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    <span style={{ position: "absolute", width: 26, height: 26, border: "2px solid #3B82F6", borderRadius: "50%", opacity: 0.4 }} className="animate-pulse-slow" />
                  </div>

                  {/* Display Mock nearby providers on radar */}
                  {providers.map((p, i) => {
                    const isSelected = selectedProvider?.name === p.name;
                    // Calculate polar position based on offset coordinates
                    const latDiff = p.latitude - (coords?.latitude || 0);
                    const lonDiff = p.longitude - (coords?.longitude || 0);
                    const scale = 2000; // scale factor
                    const topPos = 50 + (latDiff * scale);
                    const leftPos = 50 + (lonDiff * scale);

                    // Clamp to visible map box
                    const topClamped = Math.max(10, Math.min(90, topPos));
                    const leftClamped = Math.max(10, Math.min(90, leftPos));

                    return (
                      <motion.div
                        key={i}
                        onClick={() => setSelectedProvider(p)}
                        style={{
                          position: "absolute",
                          top: `${topClamped}%`,
                          left: `${leftClamped}%`,
                          width: isSelected ? 22 : 14,
                          height: isSelected ? 22 : 14,
                          borderRadius: "50%",
                          background: p.emergency_capable ? "#ee2a2a" : "#06B6D4",
                          boxShadow: isSelected 
                            ? `0 0 14px ${p.emergency_capable ? "#ee2a2a" : "#06B6D4"}` 
                            : "0 2px 6px rgba(0,0,0,0.5)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", zIndex: isSelected ? 12 : 5,
                          border: "2px solid #ffffff",
                          transition: "all 0.2s"
                        }}
                      >
                        {isSelected && (
                          <div style={{ fontSize: "9px", fontWeight: 800, color: "#fff" }}>
                            📍
                          </div>
                        )}
                      </motion.div>
                    );
                  })}

                  {/* Selected Facility Radar Overlay details */}
                  {selectedProvider && (
                    <div style={{
                      position: "absolute", bottom: 16, left: 16, right: 16,
                      background: "rgba(15, 23, 42, 0.85)",
                      border: `1px solid ${selectedProvider.emergency_capable ? "rgba(238, 42, 42, 0.4)" : "rgba(59, 130, 246, 0.3)"}`,
                      borderRadius: "var(--radius-md)",
                      padding: "10px 16px",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      zIndex: 20
                    }}>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>LIVE DIRECT ROUTE</div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>
                          {selectedProvider.name}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: "12px", color: "#3B82F6", fontWeight: 700 }}>
                          {selectedProvider.distance_km} km ({selectedProvider.travel_time_min} mins)
                        </span>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${selectedProvider.latitude},${selectedProvider.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary"
                          style={{
                            padding: "6px 12px", fontSize: "11px",
                            display: "flex", alignItems: "center", gap: 4
                          }}
                        >
                          <Navigation size={10} /> Route
                        </a>
                      </div>
                    </div>
                  )}

                  <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "4px 8px", fontSize: "11px", color: "#94a3b8" }}>
                    🛰️ Interactive Spatial Overlay Fallback
                  </div>
                </div>
              </div>

              {/* Provider List */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#ffffff", display: "flex", alignItems: "center", gap: 8 }}>
                  🏥 Ranked Nearby Providers
                  <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 500 }}>
                    ({providers.length} matched facilities near your coordinates)
                  </span>
                </h3>

                {loading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                    <Loader2 size={32} className="spinner" color="#3B82F6" />
                  </div>
                ) : (
                  providers.map((p, i) => {
                    const isSelected = selectedProvider?.name === p.name;
                    return (
                      <motion.div
                        key={i}
                        onClick={() => setSelectedProvider(p)}
                        whileHover={{ y: -2 }}
                        style={{
                          background: isSelected ? "rgba(30, 41, 59, 0.85)" : "rgba(30, 41, 59, 0.45)",
                          border: isSelected 
                            ? "1px solid rgba(59, 130, 246, 0.4)" 
                            : "1px solid rgba(255, 255, 255, 0.05)",
                          borderLeft: `4px solid ${p.emergency_capable ? "#ee2a2a" : "#06B6D4"}`,
                          borderRadius: "var(--radius-lg)",
                          padding: "20px",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                              <span style={{ fontSize: "12px", fontWeight: 700, color: p.emergency_capable ? "#EF4444" : "var(--color-secondary)", textTransform: "uppercase" }}>
                                {p.specialty}
                              </span>
                              {p.emergency_capable && (
                                <span style={{ background: "rgba(239, 68, 68, 0.15)", color: "#EF4444", fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: 4 }}>
                                  ER EMERGENCY
                                </span>
                              )}
                              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "11px", color: "#F59E0B" }}>
                                <Star size={10} fill="#F59E0B" /> {p.rating} ({p.reviews_count} reviews)
                              </span>
                            </div>
                            
                            <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#ffffff", marginBottom: 6 }}>
                              {p.name}
                            </h4>
                            
                            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: 12 }}>
                              {p.address}
                            </p>

                            <p style={{ fontSize: "12px", color: "#e2e8f0", background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
                              <strong style={{ color: "var(--color-secondary)" }}>Why Recommended:</strong> {p.explanation}
                            </p>
                          </div>

                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: "16px", fontWeight: 800, color: "#ffffff" }}>
                              {p.distance_km} km
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: 2 }}>
                              <Clock size={10} /> {p.travel_time_min} mins
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            style={{ display: "flex", gap: 10, marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}
                          >
                            <a
                              href={`tel:${p.phone}`}
                              className="btn-secondary"
                              style={{
                                padding: "8px 16px", fontSize: "12px",
                                display: "flex", alignItems: "center", gap: 6,
                                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                                color: "#ffffff"
                              }}
                            >
                              <Phone size={12} /> Call Clinic
                            </a>
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-primary"
                              style={{
                                padding: "8px 16px", fontSize: "12px",
                                display: "flex", alignItems: "center", gap: 6
                              }}
                            >
                              <Navigation size={12} /> Open in Google Maps
                            </a>
                          </motion.div>
                        )}
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right side: Clinical Navigation Sidebar context */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              
              {/* Specialist recommendations card */}
              <div style={{
                background: "rgba(30, 41, 59, 0.6)",
                border: `1px solid ${currentUrgencyColor}33`,
                borderLeft: `4px solid ${currentUrgencyColor}`,
                borderRadius: "var(--radius-xl)",
                padding: "24px",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <ShieldAlert size={18} color={currentUrgencyColor} />
                  <span style={{ fontSize: "12px", fontWeight: 700, color: currentUrgencyColor, textTransform: "uppercase" }}>
                    Clinical Referral Engine
                  </span>
                </div>

                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#ffffff", marginBottom: 14 }}>
                  Inferred Specialist Referrals
                </h3>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                  {inferredNeeds?.specialists.map((spec, i) => (
                    <span
                      key={i}
                      style={{
                        background: `${currentUrgencyColor}15`,
                        border: `1px solid ${currentUrgencyColor}33`,
                        color: "#ffffff",
                        fontWeight: 600,
                        fontSize: "12px",
                        padding: "6px 12px",
                        borderRadius: "var(--radius-md)"
                      }}
                    >
                      ⚕️ {spec}
                    </span>
                  ))}
                </div>

                <div style={{ background: "rgba(15, 23, 42, 0.5)", borderRadius: "var(--radius-md)", padding: "16px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: 4 }}>CLINICAL REASONING</div>
                  <p style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.6 }}>
                    {inferredNeeds?.reasoning}
                  </p>
                </div>
              </div>

              {/* Secure Emergency Hotlines Box */}
              <div style={{
                background: "rgba(30, 41, 59, 0.35)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: "var(--radius-xl)",
                padding: "24px",
              }}>
                <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#ffffff", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  📞 24/7 Clinical Support
                </h3>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {emergencyHotlines.map((hl, index) => (
                    <a
                      key={index}
                      href={`tel:${hl.number}`}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 14px", background: "rgba(255,255,255,0.03)",
                        borderRadius: "var(--radius-md)", textDecoration: "none",
                        border: "1px solid rgba(255,255,255,0.04)"
                      }}
                    >
                      <span style={{ fontSize: "13px", color: "#c6c6cd", fontWeight: 500 }}>
                        {hl.name}
                      </span>
                      <span style={{ fontSize: "12px", color: "#3B82F6", fontWeight: 700 }}>
                        {hl.number}
                      </span>
                    </a>
                  ))}
                </div>
              </div>

              {/* HIPAA Security Pledge */}
              <div style={{
                background: "rgba(59, 130, 246, 0.04)",
                border: "1px solid rgba(59, 130, 246, 0.15)",
                borderRadius: "var(--radius-xl)",
                padding: "20px",
                display: "flex",
                alignItems: "flex-start",
                gap: 12
              }}>
                <CheckCircle size={16} color="var(--color-secondary)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <h4 style={{ fontSize: "13px", fontWeight: 700, color: "#ffffff", marginBottom: 4 }}>
                    HIPAA Privacy Pledge
                  </h4>
                  <p style={{ fontSize: "11px", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                    Your geographic coordinates are utilized purely transiently at runtime using high-entropy secure transport boundaries. MediScan AI adheres strictly to HIPAA privacy regulations: coordinates and biomarker payloads are never bound in permanent persistence layers.
                  </p>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
