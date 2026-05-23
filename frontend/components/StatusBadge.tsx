interface StatusBadgeProps {
  risk: "Normal" | "Moderate" | "Critical" | string;
  size?: "sm" | "md";
}

const RISK_CONFIG: Record<string, { label: string; dot: string; className: string }> = {
  Normal:   { label: "Normal",   dot: "#16A34A", className: "badge badge-normal" },
  Moderate: { label: "Moderate", dot: "#D97706", className: "badge badge-moderate" },
  Critical: { label: "Critical", dot: "#DC2626", className: "badge badge-critical" },
};

export default function StatusBadge({ risk, size = "md" }: StatusBadgeProps) {
  const config = RISK_CONFIG[risk] ?? RISK_CONFIG["Normal"];
  return (
    <span
      className={config.className}
      style={{ fontSize: size === "sm" ? "11px" : "12px", padding: size === "sm" ? "3px 10px" : "4px 12px" }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: config.dot,
          display: "inline-block",
        }}
      />
      {config.label}
    </span>
  );
}
