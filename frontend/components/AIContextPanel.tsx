"use client";

import { motion } from "framer-motion";
import { Sparkles, AlertOctagon, Info, Stethoscope } from "lucide-react";

interface AIContextPanelProps {
  urgency: string;
  careCategory: string;
  reasoning: string;
  emergencyTriggers: string[];
}

export default function AIContextPanel({
  urgency, careCategory, reasoning, emergencyTriggers
}: AIContextPanelProps) {
  const isCritical = urgency === "CRITICAL";
  const isUrgent = urgency === "URGENT";

  const bannerColor = isCritical 
    ? "var(--color-danger)" 
    : isUrgent 
      ? "var(--color-warning)" 
      : "var(--color-primary)";
      
  const bannerBg = isCritical 
    ? "#FEF2F2" 
    : isUrgent 
      ? "#FFFBEB" 
      : "#EFF6FF";

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: bannerBg,
        border: `1px solid ${bannerColor}40`,
        borderRadius: "var(--radius-lg)",
        padding: "20px 24px",
        marginBottom: "24px",
        boxShadow: "var(--shadow-sm)"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{
          background: isCritical ? "#FEE2E2" : isUrgent ? "#FEF3C7" : "#DBEAFE",
          padding: "12px", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          {isCritical ? (
            <AlertOctagon size={24} color={bannerColor} />
          ) : isUrgent ? (
            <Info size={24} color={bannerColor} />
          ) : (
            <Sparkles size={24} color={bannerColor} />
          )}
        </div>
        
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700, color: bannerColor }}>
              AI Navigation Guidance
            </h2>
            <span style={{
              fontSize: "11px", fontWeight: 800, color: "#fff", background: bannerColor,
              padding: "3px 10px", borderRadius: "var(--radius-full)", letterSpacing: 0.5
            }}>
              {urgency}
            </span>
            <span style={{
              fontSize: "11px", fontWeight: 700, color: "var(--color-text-secondary)", background: "#fff",
              border: "1px solid var(--color-border)", padding: "2px 10px", borderRadius: "var(--radius-full)"
            }}>
              {careCategory}
            </span>
          </div>
          
          <p style={{ fontSize: "15px", color: "var(--color-text-primary)", lineHeight: 1.6, marginBottom: 12 }}>
            {reasoning}
          </p>

          {emergencyTriggers && emergencyTriggers.length > 0 && (
            <div style={{ 
              background: "#fff", borderRadius: "var(--radius-md)", padding: "12px",
              borderLeft: `4px solid ${bannerColor}`
            }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 6, textTransform: "uppercase" }}>
                Critical Triggers Detected:
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: "13px", color: bannerColor, fontWeight: 600 }}>
                {emergencyTriggers.map((trigger, idx) => (
                  <li key={idx} style={{ marginBottom: 4 }}>{trigger}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
