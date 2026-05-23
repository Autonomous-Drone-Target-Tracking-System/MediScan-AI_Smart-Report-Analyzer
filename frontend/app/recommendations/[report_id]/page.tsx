"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import axios from "axios";
import Navbar from "@/components/Navbar";
import { getAuthHeaders } from "@/utils/auth";
import { Loader2, AlertCircle, ArrowLeft, Map } from "lucide-react";
import Link from "next/link";

import MockHealthcareMap from "@/components/MockHealthcareMap";
import DoctorCard, { DoctorRecommendation } from "@/components/DoctorCard";
import AIContextPanel from "@/components/AIContextPanel";
import SpecialistFilters from "@/components/SpecialistFilters";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface RecommendationData {
  inferred_needs: {
    report_id: number;
    specialists: string[];
    urgency: string;
    care_category: string;
    reasoning: string;
    emergency_triggers: string[];
  };
  providers: DoctorRecommendation[];
  emergency_hotlines: { name: string; number: string }[];
}

export default function RecommendationsPage() {
  const params = useParams();
  const reportId = params?.report_id as string;

  const [data, setData] = useState<RecommendationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  const [locating, setLocating] = useState(true);

  // Filters
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProviderIndex, setSelectedProviderIndex] = useState<number | null>(null);

  useEffect(() => {
    // 1. Get user location (with fallback)
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
          setLocating(false);
        },
        (err) => {
          console.warn("Geolocation denied or error, using fallback coordinates (New York).", err);
          setUserCoords({ lat: 40.7128, lng: -74.0060 });
          setLocating(false);
        }
      );
    } else {
      setUserCoords({ lat: 40.7128, lng: -74.0060 });
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    // 2. Fetch recommendations once we have coords
    if (!reportId || locating || !userCoords) return;

    const fetchRecommendations = async () => {
      try {
        setLoading(true);
        const res = await axios.post(`${API_URL}/api/recommendations/${reportId}`, {
          latitude: userCoords.lat,
          longitude: userCoords.lng
        }, {
          headers: getAuthHeaders()
        });
        setData(res.data);
      } catch (e: any) {
        setError(e?.response?.data?.detail || "Failed to load healthcare recommendations.");
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [reportId, locating, userCoords]);

  // Derived state: Filtered providers
  const filteredProviders = data?.providers.filter(p => {
    const matchesSpecialty = selectedSpecialty ? p.specialty === selectedSpecialty : true;
    const matchesSearch = searchQuery 
      ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.explanation.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchesSpecialty && matchesSearch;
  }) || [];

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "calc(100vh - 64px)" }}>
        
        {/* Header Strip */}
        <div style={{ 
          background: "#fff", borderBottom: "1px solid var(--color-border)", 
          padding: "16px 24px", display: "flex", alignItems: "center", gap: 16
        }}>
          <Link href="/history" style={{ 
            display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary)",
            textDecoration: "none", fontSize: "14px", fontWeight: 600
          }}>
            <ArrowLeft size={16} /> Back
          </Link>
          <div style={{ width: 1, height: 24, background: "var(--color-border)" }} />
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Map size={18} color="var(--color-primary)" />
            Healthcare Discovery <span style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>| Report #{reportId}</span>
          </h1>
        </div>

        {/* Loading / Error States */}
        {(locating || loading) && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
              <Loader2 size={40} color="var(--color-primary)" />
            </motion.div>
            <p style={{ marginTop: 16, color: "var(--color-text-secondary)", fontWeight: 500 }}>
              {locating ? "Locating you securely..." : "Analyzing report & matching specialists..."}
            </p>
          </div>
        )}

        {error && !loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", padding: 24, borderRadius: 12, color: "#991B1B", display: "flex", gap: 12 }}>
              <AlertCircle size={24} style={{ flexShrink: 0 }} />
              <div>
                <h3 style={{ fontWeight: 700, margin: "0 0 8px 0" }}>Analysis Failed</h3>
                <p style={{ margin: 0 }}>{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Interface Split Screen */}
        {!loading && !error && data && userCoords && (
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            
            {/* Left Panel: List & AI Context */}
            <div style={{ 
              width: "45%", minWidth: "400px", maxWidth: "600px", 
              background: "var(--color-bg)", borderRight: "1px solid var(--color-border)",
              display: "flex", flexDirection: "column", overflowY: "auto",
              padding: "24px"
            }}>
              
              <AIContextPanel 
                urgency={data.inferred_needs.urgency}
                careCategory={data.inferred_needs.care_category}
                reasoning={data.inferred_needs.reasoning}
                emergencyTriggers={data.inferred_needs.emergency_triggers}
              />

              <SpecialistFilters 
                specialists={data.inferred_needs.specialists}
                selectedSpecialty={selectedSpecialty}
                onSelect={setSelectedSpecialty}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
                {filteredProviders.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)" }}>
                    No providers match your filter criteria.
                  </div>
                ) : (
                  filteredProviders.map((provider, index) => (
                    <DoctorCard 
                      key={index} 
                      doctor={provider} 
                      index={index}
                      isSelected={selectedProviderIndex === index}
                      onClick={() => setSelectedProviderIndex(index)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Right Panel: Map */}
            <div style={{ flex: 1, position: "relative", padding: "16px", background: "var(--color-bg)" }}>
              <MockHealthcareMap 
                providers={filteredProviders}
                userLat={userCoords.lat}
                userLng={userCoords.lng}
                selectedProviderIndex={selectedProviderIndex}
                onMarkerClick={(index) => {
                  setSelectedProviderIndex(index);
                  // Scroll the left list to the selected item in a real app
                }}
              />
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
