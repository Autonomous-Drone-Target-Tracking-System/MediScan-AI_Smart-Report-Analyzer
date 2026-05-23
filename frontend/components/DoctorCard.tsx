"use client";

import { motion } from "framer-motion";
import { Star, MapPin, Clock, Phone, AlertCircle, Calendar, ArrowUpRight, Navigation } from "lucide-react";

export interface DoctorRecommendation {
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

interface DoctorCardProps {
  doctor: DoctorRecommendation;
  index: number;
  isSelected?: boolean;
  onClick?: () => void;
}

export default function DoctorCard({ doctor, index, isSelected, onClick }: DoctorCardProps) {
  const isEmergency = doctor.emergency_capable;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      onClick={onClick}
      style={{
        background: isSelected ? "var(--color-surface)" : "var(--color-surface)",
        border: `2px solid ${
          isSelected 
            ? isEmergency ? "var(--color-danger)" : "var(--color-primary)" 
            : isEmergency ? "rgba(239, 68, 68, 0.3)" : "var(--color-border)"
        }`,
        borderRadius: "var(--radius-lg)",
        padding: "16px 20px",
        cursor: "pointer",
        boxShadow: isSelected ? "var(--shadow-md)" : "var(--shadow-sm)",
        transition: "all 0.2s ease",
        position: "relative",
        overflow: "hidden"
      }}
      whileHover={{ y: -2, boxShadow: "var(--shadow-md)" }}
    >
      {/* Emergency Flash Background */}
      {isEmergency && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "4px",
          background: "var(--color-danger)"
        }} />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <h3 style={{ 
              fontFamily: "var(--font-heading)", fontSize: "16px", fontWeight: 700,
              color: isEmergency ? "var(--color-danger)" : "var(--color-text-primary)"
            }}>
              {doctor.name}
            </h3>
            {doctor.open_now ? (
              <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-success)", background: "#ECFDF5", padding: "2px 6px", borderRadius: "4px" }}>OPEN</span>
            ) : (
              <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-text-muted)", background: "#F1F5F9", padding: "2px 6px", borderRadius: "4px" }}>CLOSED</span>
            )}
          </div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-primary)", marginBottom: 8 }}>
            {doctor.specialty}
          </div>
        </div>
        
        {/* Rating */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#FEF3C7", padding: "4px 8px", borderRadius: "var(--radius-full)" }}>
          <Star size={12} fill="#F59E0B" color="#F59E0B" />
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#92400E" }}>{doctor.rating}</span>
          <span style={{ fontSize: "10px", color: "#B45309", marginLeft: 2 }}>({doctor.reviews_count})</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "13px", color: "var(--color-text-secondary)" }}>
          <MapPin size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{doctor.address}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "13px", color: "var(--color-text-secondary)" }}>
          <Phone size={14} style={{ flexShrink: 0 }} />
          <span>{doctor.phone}</span>
        </div>
      </div>

      <div style={{ 
        background: isEmergency ? "#FEF2F2" : "#F8FAFC", 
        padding: "8px 12px", borderRadius: "var(--radius-md)", 
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 12
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Navigation size={14} color={isEmergency ? "var(--color-danger)" : "var(--color-primary)"} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>{doctor.distance_km} km away</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={14} color="var(--color-text-muted)" />
          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>~{doctor.travel_time_min} min drive</span>
        </div>
      </div>

      {isEmergency ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <a href={`tel:${doctor.phone}`} style={{ 
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: "var(--color-danger)", color: "#fff", 
            padding: "10px", borderRadius: "var(--radius-md)", fontSize: "13px", fontWeight: 600,
            textDecoration: "none"
          }}>
            <AlertCircle size={14} /> Call ER Now
          </a>
          <button style={{ 
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: "#fff", color: "var(--color-danger)", border: "1px solid var(--color-danger)",
            padding: "10px", borderRadius: "var(--radius-md)", fontSize: "13px", fontWeight: 600
          }}>
            <Navigation size={14} /> Get Directions
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button style={{ 
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: "var(--color-primary)", color: "#fff", border: "none",
            padding: "10px", borderRadius: "var(--radius-md)", fontSize: "13px", fontWeight: 600,
            cursor: "pointer"
          }}>
            <Calendar size={14} /> Book Appt
          </button>
          <button style={{ 
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: "#EFF6FF", color: "var(--color-primary)", border: "1px solid #BFDBFE",
            padding: "10px", borderRadius: "var(--radius-md)", fontSize: "13px", fontWeight: 600,
            cursor: "pointer"
          }}>
            <ArrowUpRight size={14} /> View Profile
          </button>
        </div>
      )}
    </motion.div>
  );
}
