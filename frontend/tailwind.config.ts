import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary:    "#2563EB",
        secondary:  "#06B6D4",
        success:    "#10B981",
        warning:    "#F59E0B",
        danger:     "#EF4444",
        "bg-surface": "#F8FAFC",
      },
      fontFamily: {
        heading: ["var(--font-poppins)", "Poppins", "sans-serif"],
        body:    ["var(--font-inter)",   "Inter",   "sans-serif"],
      },
      borderRadius: {
        "2xl": "20px",
        "3xl": "28px",
      },
      boxShadow: {
        card:           "0 4px 16px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)",
        "glow-primary": "0 0 24px rgba(37,99,235,0.25)",
        "glow-danger":  "0 0 20px rgba(239,68,68,0.20)",
        "glow-warning": "0 0 20px rgba(245,158,11,0.20)",
      },
    },
  },
  plugins: [],
};

export default config;
