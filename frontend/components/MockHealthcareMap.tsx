"use client";

import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, AlertTriangle, Crosshair, Navigation2 } from "lucide-react";
import { DoctorRecommendation } from "./DoctorCard";

interface MockHealthcareMapProps {
  providers: DoctorRecommendation[];
  userLat: number;
  userLng: number;
  selectedProviderIndex: number | null;
  onMarkerClick: (index: number) => void;
}

export default function MockHealthcareMap({ 
  providers, userLat, userLng, selectedProviderIndex, onMarkerClick 
}: MockHealthcareMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  
  // Calculate bounding box to normalize coordinates
  const [bounds, setBounds] = useState({ minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 });

  useEffect(() => {
    if (providers.length === 0) return;
    
    let minLat = userLat, maxLat = userLat;
    let minLng = userLng, maxLng = userLng;

    providers.forEach(p => {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    });

    // Add padding
    const latPad = (maxLat - minLat) * 0.2 || 0.02;
    const lngPad = (maxLng - minLng) * 0.2 || 0.02;

    setBounds({
      minLat: minLat - latPad,
      maxLat: maxLat + latPad,
      minLng: minLng - lngPad,
      maxLng: maxLng + lngPad
    });
  }, [providers, userLat, userLng]);

  // Convert lat/lng to percentage based on bounds
  const getPosition = (lat: number, lng: number) => {
    if (bounds.maxLat === bounds.minLat || bounds.maxLng === bounds.minLng) {
      return { top: "50%", left: "50%" };
    }
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100;
    return { left: `${x}%`, top: `${y}%` };
  };

  return (
    <div 
      ref={mapRef}
      style={{
        width: "100%",
        height: "100%",
        background: "#E5E3DF", // Google Maps default land color
        position: "relative",
        overflow: "hidden",
        borderRadius: "var(--radius-xl)",
        boxShadow: "inset 0 0 20px rgba(0,0,0,0.05)"
      }}
    >
      {/* Decorative Map Elements (Simulated Roads/Terrain) */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.4 }}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#FFFFFF" strokeWidth="2"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Fake highways */}
          <path d="M 0 30 Q 300 150 800 100" fill="none" stroke="#F5D073" strokeWidth="6" strokeLinecap="round"/>
          <path d="M 100 0 Q 200 400 600 800" fill="none" stroke="#F5D073" strokeWidth="6" strokeLinecap="round"/>
          <path d="M 0 500 Q 400 300 800 600" fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round"/>
        </svg>
      </div>

      {/* User Location Marker */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        style={{
          position: "absolute",
          ...getPosition(userLat, userLng),
          transform: "translate(-50%, -50%)",
          zIndex: 10
        }}
      >
        <div style={{ position: "relative" }}>
          <motion.div
            animate={{ scale: [1, 2, 1], opacity: [0.8, 0, 0.8] }}
            transition={{ repeat: Infinity, duration: 2 }}
            style={{
              position: "absolute", top: -8, left: -8, right: -8, bottom: -8,
              background: "var(--color-primary)", borderRadius: "50%", opacity: 0.3
            }}
          />
          <div style={{
            width: 16, height: 16, background: "var(--color-primary)",
            borderRadius: "50%", border: "3px solid #fff", boxShadow: "0 2px 4px rgba(0,0,0,0.3)"
          }} />
          <div style={{
            position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)",
            background: "#fff", padding: "2px 6px", borderRadius: "4px",
            fontSize: "10px", fontWeight: 700, boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            whiteSpace: "nowrap", color: "var(--color-primary)"
          }}>
            You are here
          </div>
        </div>
      </motion.div>

      {/* Provider Markers */}
      <AnimatePresence>
        {providers.map((provider, index) => {
          const isSelected = selectedProviderIndex === index;
          const pos = getPosition(provider.latitude, provider.longitude);
          const isEmergency = provider.emergency_capable;
          
          return (
            <motion.div
              key={`${provider.name}-${index}`}
              initial={{ scale: 0, y: -20 }}
              animate={{ scale: 1, y: 0 }}
              style={{
                position: "absolute",
                left: pos.left,
                top: pos.top,
                transform: "translate(-50%, -100%)",
                zIndex: isSelected ? 20 : isEmergency ? 15 : 5,
                cursor: "pointer"
              }}
              onClick={() => onMarkerClick(index)}
            >
              <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
                
                {/* Info Window (Only show if selected) */}
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    style={{
                      position: "absolute", bottom: "100%", marginBottom: 8,
                      background: "#fff", borderRadius: "8px", padding: "8px 12px",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.15)", whiteSpace: "nowrap",
                      zIndex: 30, pointerEvents: "none",
                      border: `2px solid ${isEmergency ? "var(--color-danger)" : "var(--color-primary)"}`
                    }}
                  >
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-text-primary)" }}>
                      {provider.name}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>
                      {provider.travel_time_min} min drive
                    </div>
                    {/* Tail */}
                    <div style={{
                      position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%) rotate(45deg)",
                      width: 10, height: 10, background: "#fff",
                      borderRight: `2px solid ${isEmergency ? "var(--color-danger)" : "var(--color-primary)"}`,
                      borderBottom: `2px solid ${isEmergency ? "var(--color-danger)" : "var(--color-primary)"}`
                    }} />
                  </motion.div>
                )}

                {/* Marker Pin */}
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  animate={isSelected ? { y: -5 } : { y: 0 }}
                  style={{
                    background: isEmergency ? "var(--color-danger)" : "var(--color-primary)",
                    width: isSelected ? 36 : 28, height: isSelected ? 36 : 28,
                    borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                    border: "2px solid #fff"
                  }}
                >
                  {isEmergency ? (
                    <AlertTriangle size={isSelected ? 18 : 14} color="#fff" />
                  ) : (
                    <MapPin size={isSelected ? 18 : 14} color="#fff" />
                  )}
                </motion.div>
                
                {/* Pin Tail */}
                <div style={{
                  width: 0, height: 0,
                  borderLeft: `${isSelected ? 8 : 6}px solid transparent`,
                  borderRight: `${isSelected ? 8 : 6}px solid transparent`,
                  borderTop: `${isSelected ? 10 : 8}px solid ${isEmergency ? "var(--color-danger)" : "var(--color-primary)"}`,
                  marginTop: -2
                }} />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Map Controls (Visual only) */}
      <div style={{
        position: "absolute", right: 16, bottom: 16, display: "flex", flexDirection: "column", gap: 8
      }}>
        <div style={{ background: "#fff", padding: 8, borderRadius: 4, boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}>
          <Crosshair size={20} color="var(--color-text-secondary)" />
        </div>
        <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 2px 6px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #E2E8F0", fontWeight: 700, textAlign: "center" }}>+</div>
          <div style={{ padding: "8px 12px", fontWeight: 700, textAlign: "center" }}>-</div>
        </div>
      </div>
    </div>
  );
}
