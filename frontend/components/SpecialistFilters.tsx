"use client";

import { Search, Filter } from "lucide-react";

interface SpecialistFiltersProps {
  specialists: string[];
  selectedSpecialty: string | null;
  onSelect: (specialty: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function SpecialistFilters({
  specialists, selectedSpecialty, onSelect, searchQuery, onSearchChange
}: SpecialistFiltersProps) {
  
  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ 
        position: "relative", marginBottom: "16px",
        boxShadow: "var(--shadow-sm)", borderRadius: "var(--radius-lg)"
      }}>
        <Search style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }} size={18} />
        <input 
          type="text" 
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Ask AI: 'Find the best cardiologist nearby...'"
          style={{
            width: "100%", padding: "16px 16px 16px 44px",
            border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
            fontSize: "15px", fontFamily: "inherit",
            background: "var(--color-surface)", outline: "none",
            transition: "all 0.2s"
          }}
          onFocus={(e) => e.target.style.borderColor = "var(--color-primary)"}
          onBlur={(e) => e.target.style.borderColor = "var(--color-border)"}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, overflowX: "auto", paddingBottom: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary)", fontSize: "13px", fontWeight: 600 }}>
          <Filter size={14} /> Filters:
        </div>
        
        <button
          onClick={() => onSelect(null)}
          style={{
            whiteSpace: "nowrap", padding: "6px 16px", borderRadius: "var(--radius-full)",
            fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
            background: selectedSpecialty === null ? "var(--color-primary)" : "var(--color-surface)",
            color: selectedSpecialty === null ? "#fff" : "var(--color-text-secondary)",
            border: `1px solid ${selectedSpecialty === null ? "var(--color-primary)" : "var(--color-border)"}`
          }}
        >
          All Recommended
        </button>
        
        {specialists.map(specialty => (
          <button
            key={specialty}
            onClick={() => onSelect(specialty)}
            style={{
              whiteSpace: "nowrap", padding: "6px 16px", borderRadius: "var(--radius-full)",
              fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
              background: selectedSpecialty === specialty ? "var(--color-primary)" : "var(--color-surface)",
              color: selectedSpecialty === specialty ? "#fff" : "var(--color-text-secondary)",
              border: `1px solid ${selectedSpecialty === specialty ? "var(--color-primary)" : "var(--color-border)"}`
            }}
          >
            {specialty}
          </button>
        ))}
      </div>
    </div>
  );
}
