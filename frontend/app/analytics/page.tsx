"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, TrendingDown, AlertTriangle, AlertCircle, Calendar,
  RefreshCw, BarChart2, Info, ChevronRight, Activity, ArrowLeftRight,
  ShieldAlert, HelpCircle, ArrowUpRight, ArrowDownRight, Award,
  ArrowLeft, CheckCircle2, FileText
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, AreaChart, Area
} from "recharts";
import axios from "axios";
import Navbar from "@/components/Navbar";
import { getAuthHeaders } from "@/utils/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const HIGHER_IS_BETTER = new Set([
  "hdl", "hdl cholesterol", "hemoglobin", "hgb", "hb", "vitamin d",
  "vitamin b12", "ferritin", "iron", "rbc", "platelet count", "platelets"
]);

// ── Types ──
interface TimeSeriesPoint {
  report_id: number;
  date: string;
  datetime: string;
  value: number;
  unit: string;
  risk_category: string;
}

interface Delta {
  absolute_change: number;
  percent_change: number;
  from_value: number;
  to_value: number;
  from_date: string;
  to_date: string;
  span_days: number;
}

interface Anomaly {
  report_id: number;
  date: string;
  value: number;
  z_score: number;
  direction: "above" | "below";
}

interface Prediction {
  predicted_value: number;
  prediction_date: string;
  confidence: "low" | "medium" | "high";
  slope_per_reading: number;
}

interface RiskProgression {
  counts: { Normal: number; Moderate: number; Critical: number };
  trajectory: "improving" | "worsening" | "stable";
  sequence: string[];
}

interface BiomarkerTrend {
  time_series: TimeSeriesPoint[];
  delta: Delta | null;
  trend: "improving" | "worsening" | "stable" | "insufficient_data";
  anomalies: Anomaly[];
  prediction: Prediction | null;
  risk_prog: RiskProgression;
  group: string;
  reference: { min: number | null; max: number | null };
  latest_value: number;
  latest_unit: string;
  reading_count: number;
}

interface Alert {
  type: "anomaly" | "rapid_change";
  marker: string;
  message: string;
  severity: "warning" | "critical";
  date: string;
}

interface OverviewStats {
  total_reports: number;
  total_markers: number;
  worsening_count: number;
  improving_count: number;
  stable_count: number;
  alert_count: number;
  latest_score: number | null;
  score_delta: number | null;
}

interface AnalyticsPayload {
  trend_data: Record<string, BiomarkerTrend>;
  health_score_series: { report_id: number; date: string; score: number }[];
  groups: Record<string, string[]>;
  alerts: Alert[];
  ai_summary: string;
  insights: Record<string, string>;
  overview_stats: OverviewStats;
}

interface ComparisonResult {
  report_a: { report_id: number; date: string; score: number };
  report_b: { report_id: number; date: string; score: number };
  score_delta: number | null;
  biomarker_deltas: {
    name: string;
    group: string;
    unit: string;
    value_a: number | null;
    value_b: number | null;
    risk_a: string | null;
    risk_b: string | null;
    abs_change: number | null;
    pct_change: number | null;
    reference: { min: number | null; max: number | null };
    only_in_a: boolean;
    only_in_b: boolean;
  }[];
  total_shared: number;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedMarker, setSelectedMarker] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<string>("All");

  // Comparison Sandbox
  const [compareReportA, setCompareReportA] = useState<string>("");
  const [compareReportB, setCompareReportB] = useState<string>("");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Fetch analytics trends
  const fetchTrends = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      let url = `${API_URL}/api/analytics/trends?generate_ai=true`;
      if (dateFrom) url += `&date_from=${dateFrom}`;
      if (dateTo) url += `&date_to=${dateTo}`;

      const res = await axios.get(url, {
        headers: getAuthHeaders()
      });
      setData(res.data);
      setErr("");

      // Pick first available biomarker for the trend graph
      const markers = Object.keys(res.data.trend_data);
      if (markers.length > 0 && !selectedMarker) {
        // Prefer HbA1c, Glucose, or LDL if available, otherwise just grab first
        const defaultMarker = markers.find(m => /glucose|sugar|hba1c|ldl/i.test(m)) || markers[0];
        setSelectedMarker(defaultMarker);
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Failed to load longitudinal health analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, [dateFrom, dateTo]);

  // Fetch side-by-side comparison when dropdown values change
  useEffect(() => {
    if (compareReportA && compareReportB && compareReportA !== compareReportB) {
      setCompareLoading(true);
      axios.get(`${API_URL}/api/analytics/compare?a=${compareReportA}&b=${compareReportB}`, {
        headers: getAuthHeaders()
      })
        .then(res => setComparison(res.data))
        .catch(e => console.error("Comparison load error:", e))
        .finally(() => setCompareLoading(false));
    } else {
      setComparison(null);
    }
  }, [compareReportA, compareReportB]);

  // Initialize comparison report selection once data loaded
  useEffect(() => {
    if (data && data.health_score_series.length >= 2) {
      const series = data.health_score_series;
      // Set oldest as A, newest as B
      setCompareReportA(String(series[0].report_id));
      setCompareReportB(String(series[series.length - 1].report_id));
    }
  }, [data]);

  const handleResetFilters = () => {
    setDateFrom("");
    setDateTo("");
  };

  // Safe checks for empty / insufficient data states
  const reportCount = data?.overview_stats.total_reports ?? 0;
  const isInsufficient = reportCount < 2;

  // Custom tooltips for Recharts
  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-lg border border-slate-700 shadow-xl text-xs space-y-1.5 font-sans">
          <p className="font-semibold text-slate-300">{label}</p>
          <p className="text-sm font-bold">
            Value: <span className="text-sky-400">{dataPoint.value} {dataPoint.unit}</span>
          </p>
          {dataPoint.risk_category && (
            <p className="flex items-center gap-1.5">
              Status: 
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                dataPoint.risk_category === "Critical" ? "bg-red-500/20 text-red-400"
                : dataPoint.risk_category === "Moderate" ? "bg-amber-500/20 text-amber-400"
                : "bg-emerald-500/20 text-emerald-400"
              }`}>
                {dataPoint.risk_category}
              </span>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
            <RefreshCw size={48} className="text-blue-600 animate-spin" />
          </motion.div>
          <p className="text-slate-500 font-semibold animate-pulse">Loading longitudinal health telemetry...</p>
        </div>
      </div>
    );
  }

  // Welcome / Insufficient data state
  if (err || isInsufficient) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="container mx-auto px-4 py-16 flex flex-col items-center max-w-2xl">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-10 border border-slate-200 shadow-xl text-center space-y-6"
          >
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <TrendingUp size={40} />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-800 font-heading">
              Longitudinal Trend Intelligence
            </h1>
            <p className="text-slate-600 leading-relaxed">
              MediScan AI tracks the clinical evolution of your biomarkers over time. However, building predictive graphs, anomaly detection models, and delta grids requires **at least two medical reports**.
            </p>
            
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200/60 text-left space-y-4 max-w-md mx-auto text-sm text-slate-600">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                <Award size={16} className="text-blue-500" /> What activation grants you:
              </h3>
              <ul className="space-y-2 list-disc list-inside">
                <li>Dynamic multi-report biomarker comparison</li>
                <li>Predictive health algorithms (90-day trajectory)</li>
                <li>Z-Score physiological anomaly identification</li>
                <li>AI overall natural language progression briefs</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link href="/upload" className="btn-primary flex items-center justify-center gap-2">
                <FileText size={18} /> Upload Another Report
              </Link>
              <Link href="/history" className="btn-secondary flex items-center justify-center gap-2">
                View Upload History
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Extract variables for rendering
  const stats = data!.overview_stats;
  const trendData = data!.trend_data;
  const scoreSeries = data!.health_score_series;
  const groupsList = Object.keys(data!.groups);
  const alerts = data!.alerts;

  // Filter biomarker names according to clinical group
  const activeMarkers = Object.keys(trendData).filter(name => {
    if (selectedGroup === "All") return true;
    return trendData[name].group === selectedGroup;
  });

  const activeTrend = selectedMarker ? trendData[selectedMarker] : null;

  return (
    <div className="min-h-screen bg-slate-50/70 pb-20 font-body">
      <Navbar />

      <div className="container mx-auto px-4 py-8 space-y-8">
        
        {/* ── Page Title & Global Date Filters ── */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm uppercase tracking-wider mb-1">
              <TrendingUp size={16} /> Longitudinal Telemetry Engine
            </div>
            <h1 className="text-3xl lg:text-4xl font-black text-slate-800 font-heading tracking-tight">
              Biomarker <span className="gradient-text font-black">Trend Analytics</span>
            </h1>
          </div>

          {/* Date range filters */}
          <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm text-sm">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-slate-400" />
              <input 
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 font-medium text-slate-700" 
              />
              <span className="text-slate-400">to</span>
              <input 
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 font-medium text-slate-700" 
              />
            </div>
            {(dateFrom || dateTo) && (
              <button 
                onClick={handleResetFilters}
                className="text-xs font-semibold text-rose-500 hover:text-rose-600 transition"
              >
                Clear Range
              </button>
            )}
            <button 
              onClick={() => fetchTrends(true)}
              disabled={refreshing}
              className="text-slate-400 hover:text-blue-500 transition p-1.5"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin text-blue-500" : ""} />
            </button>
          </div>
        </div>

        {/* ── Section 1: Clinical Progression Metrics Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Health Score Evolution */}
          <motion.div 
            whileHover={{ y: -3 }}
            className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm relative overflow-hidden"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Health score evolution</div>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Activity size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-slate-800 font-heading">
                {stats.latest_score ?? "—"}
              </span>
              <span className="text-xs text-slate-400">/100</span>
              {stats.score_delta !== null && (
                <span className={`text-xs font-bold flex items-center gap-0.5 ml-2 ${
                  stats.score_delta >= 0 ? "text-emerald-500" : "text-rose-500"
                }`}>
                  {stats.score_delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {stats.score_delta >= 0 ? "+" : ""}{stats.score_delta} pts
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">Aggregated wellness rating index</p>
            {/* Minimal line sparkline in background */}
            <div className="h-10 mt-3 opacity-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={scoreSeries}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#scoreGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Worsening Indicators */}
          <motion.div 
            whileHover={{ y: -3 }}
            className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Worsening Markers</div>
              <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center animate-pulse">
                <TrendingDown size={16} />
              </div>
            </div>
            <div className="text-4xl font-extrabold text-slate-800 font-heading">
              {stats.worsening_count}
            </div>
            <p className="text-xs text-slate-500 mt-2">Biomarkers demonstrating adverse shifting</p>
            {stats.worsening_count > 0 ? (
              <span className="inline-flex items-center text-[10px] font-bold bg-rose-50 text-rose-500 px-2 py-0.5 rounded-full uppercase tracking-wider mt-3">
                Requires Audit 🚨
              </span>
            ) : (
              <span className="inline-flex items-center text-[10px] font-bold bg-emerald-50 text-emerald-500 px-2 py-0.5 rounded-full uppercase tracking-wider mt-3">
                Good Standing ✨
              </span>
            )}
          </motion.div>

          {/* Improving Indicators */}
          <motion.div 
            whileHover={{ y: -3 }}
            className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Improving Markers</div>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center">
                <TrendingUp size={16} />
              </div>
            </div>
            <div className="text-4xl font-extrabold text-slate-800 font-heading">
              {stats.improving_count}
            </div>
            <p className="text-xs text-slate-500 mt-2">Biomarkers recovering towards normal reference ranges</p>
            <span className="inline-flex items-center text-[10px] font-bold bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full uppercase tracking-wider mt-3">
              Positive Path 👍
            </span>
          </motion.div>

          {/* Active Clinical Alerts */}
          <motion.div 
            whileHover={{ y: -3 }}
            className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Physiological Alerts</div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                stats.alert_count > 0 ? "bg-amber-50 text-amber-500" : "bg-slate-50 text-slate-400"
              }`}>
                <AlertTriangle size={16} />
              </div>
            </div>
            <div className="text-4xl font-extrabold text-slate-800 font-heading">
              {stats.alert_count}
            </div>
            <p className="text-xs text-slate-500 mt-2">Z-Score anomalies or extreme velocity shifts</p>
            {stats.alert_count > 0 ? (
              <span className="inline-flex items-center text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full uppercase tracking-wider mt-3">
                Review Required 🔔
              </span>
            ) : (
              <span className="inline-flex items-center text-[10px] font-bold bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-wider mt-3">
                Clear Record ✅
              </span>
            )}
          </motion.div>
        </div>

        {/* ── Section 2: AI Trend Intelligence Narrative Summary ── */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-3xl p-8 text-white relative shadow-lg overflow-hidden border border-blue-500"
        >
          {/* Faint circles background design */}
          <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 80%) pointer-events-none" />
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3 flex-1">
              <h2 className="text-2xl font-black font-heading flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-lg">💡</span>
                AI Trend Intelligence summary
              </h2>
              <p className="text-blue-50 leading-relaxed text-sm md:text-base italic max-w-4xl">
                "{data!.ai_summary}"
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── Section 3: Interactive Trend Chart & Predictive Analytics Sandbox ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Chart Card */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6 flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800 font-heading">
                  Interactive Marker Timeline
                </h2>
                <p className="text-xs text-slate-400">Compare values against recommended clinical reference levels</p>
              </div>

              {/* Group & Marker Selector Dropdowns */}
              <div className="flex flex-wrap items-center gap-2">
                <select 
                  value={selectedGroup}
                  onChange={e => {
                    setSelectedGroup(e.target.value);
                    // Reset selected marker to first marker in the newly selected group
                    const newGroup = e.target.value;
                    const groupMarkers = Object.keys(trendData).filter(m => 
                      newGroup === "All" ? true : trendData[m].group === newGroup
                    );
                    if (groupMarkers.length > 0) {
                      setSelectedMarker(groupMarkers[0]);
                    }
                  }}
                  className="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl px-3 py-2 text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="All">All Categories</option>
                  {groupsList.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>

                <select 
                  value={selectedMarker}
                  onChange={e => setSelectedMarker(e.target.value)}
                  className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {activeMarkers.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Recharts Graphical Panel */}
            <div className="h-[320px] w-100% flex-1 relative min-h-[300px]">
              {activeTrend && activeTrend.time_series.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={activeTrend.time_series}
                    margin={{ top: 20, right: 20, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="#94a3b8" 
                      fontSize={11} 
                      tickLine={false} 
                      dy={10} 
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={11} 
                      tickLine={false} 
                      dx={-5} 
                      domain={['auto', 'auto']}
                    />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend 
                      verticalAlign="top" 
                      height={36} 
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span className="text-xs font-bold text-slate-600">{value}</span>}
                    />

                    {/* Faint reference bounds lines */}
                    {activeTrend.reference.min !== null && (
                      <ReferenceLine 
                        y={activeTrend.reference.min} 
                        stroke="#10b981" 
                        strokeDasharray="4 4" 
                        label={{ value: `Ref Min: ${activeTrend.reference.min}`, fill: '#10b981', position: 'top', fontSize: 9, fontWeight: 'bold' }} 
                      />
                    )}
                    {activeTrend.reference.max !== null && (
                      <ReferenceLine 
                        y={activeTrend.reference.max} 
                        stroke="#ef4444" 
                        strokeDasharray="4 4" 
                        label={{ value: `Ref Max: ${activeTrend.reference.max}`, fill: '#ef4444', position: 'bottom', fontSize: 9, fontWeight: 'bold' }} 
                      />
                    )}

                    <Line 
                      name={`${selectedMarker} (Value)`}
                      type="monotone" 
                      dataKey="value" 
                      stroke="var(--color-primary)" 
                      strokeWidth={3} 
                      activeDot={{ r: 7, strokeWidth: 0, fill: "var(--color-primary-light)" }}
                      dot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: "var(--color-primary)" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  No time-series values recorded for this biomarker
                </div>
              )}
            </div>
          </div>

          {/* Predictive Insights & Direction Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6 flex flex-col">
            <div>
              <h2 className="text-xl font-bold text-slate-800 font-heading">
                Analytical Intelligence
              </h2>
              <p className="text-xs text-slate-400">Algorithmic risk shifts and predictions</p>
            </div>

            {activeTrend && (
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                
                {/* Trend direction card */}
                <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Historical Trend Path</div>
                    <div className={`text-lg font-black font-heading mt-1 flex items-center gap-1.5 uppercase ${
                      activeTrend.trend === "improving" ? "text-emerald-600"
                      : activeTrend.trend === "worsening" ? "text-rose-600"
                      : "text-slate-600"
                    }`}>
                      {activeTrend.trend === "improving" ? (
                        <>
                          <TrendingUp size={20} /> Improving
                        </>
                      ) : activeTrend.trend === "worsening" ? (
                        <>
                          <TrendingDown size={20} /> Worsening
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={18} /> Stable
                        </>
                      )}
                    </div>
                  </div>

                  {activeTrend.delta && (
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Overall shift</div>
                      <span className={`text-sm font-extrabold flex items-center justify-end gap-0.5 mt-1 ${
                        activeTrend.delta.percent_change >= 0 ? "text-slate-700" : "text-slate-700"
                      }`}>
                        {activeTrend.delta.percent_change >= 0 ? "+" : ""}{activeTrend.delta.percent_change}%
                      </span>
                    </div>
                  )}
                </div>

                {/* 90-Day predictive extrapolation */}
                {activeTrend.prediction ? (
                  <div className="border border-blue-100 bg-blue-50/40 p-4 rounded-2xl space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Next 90 days prediction</div>
                      <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase tracking-wider">
                        Confidence: {activeTrend.prediction.confidence}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-slate-800">
                        {activeTrend.prediction.predicted_value}
                      </span>
                      <span className="text-xs text-slate-500">{activeTrend.latest_unit}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Linear forecast target date: <span className="font-semibold text-slate-600">{activeTrend.prediction.prediction_date}</span>
                    </p>
                  </div>
                ) : (
                  <div className="bg-slate-50 text-slate-400 text-center p-6 rounded-2xl text-xs">
                    More points needed to compute predictive models
                  </div>
                )}

                {/* AI Deep Insights for current marker */}
                <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-4 space-y-2.5">
                  <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                    🩺 AI Deep Explanation
                  </h4>
                  <p className="text-slate-600 text-xs leading-relaxed font-medium italic">
                    "{data?.insights[selectedMarker] || "Analyzing marker progression metrics..."}"
                  </p>
                </div>

                <div className="text-[10px] text-slate-400 text-center">
                  💡 Clinically normal values range between {activeTrend.reference.min ?? "—"} and {activeTrend.reference.max ?? "—"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Section 4: Dynamic Sandbox side-by-side comparison grid ── */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 font-heading">
                Side-by-Side Comparison Sandbox
              </h2>
              <p className="text-xs text-slate-400">Select any two reports to perform cross-report delta analysis</p>
            </div>

            {/* Select A & B */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold bg-slate-50 border border-slate-200 p-2 rounded-xl">
                <span>Base Report A:</span>
                <select 
                  value={compareReportA} 
                  onChange={e => setCompareReportA(e.target.value)}
                  className="bg-transparent font-bold text-slate-700 outline-none"
                >
                  {scoreSeries.map(s => (
                    <option key={s.report_id} value={s.report_id}>#{s.report_id} ({s.date})</option>
                  ))}
                </select>
              </div>

              <ArrowLeftRight size={14} className="text-slate-400" />

              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold bg-slate-50 border border-slate-200 p-2 rounded-xl">
                <span>Target Report B:</span>
                <select 
                  value={compareReportB} 
                  onChange={e => setCompareReportB(e.target.value)}
                  className="bg-transparent font-bold text-slate-700 outline-none"
                >
                  {scoreSeries.map(s => (
                    <option key={s.report_id} value={s.report_id}>#{s.report_id} ({s.date})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {compareLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <RefreshCw size={24} className="animate-spin text-blue-600" />
              <p className="text-xs font-semibold">Generating side-by-side deltas...</p>
            </div>
          ) : comparison ? (
            <div className="space-y-6">
              {/* Header comparative cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/50 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Base Report (A) Score</span>
                  <div className="text-2xl font-black text-slate-800 mt-1 font-heading">{comparison.report_a.score} /100</div>
                  <span className="text-[10px] text-slate-500 mt-0.5">Date: {comparison.report_a.date}</span>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/50 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Target Report (B) Score</span>
                  <div className="text-2xl font-black text-slate-800 mt-1 font-heading">{comparison.report_b.score} /100</div>
                  <span className="text-[10px] text-slate-500 mt-0.5">Date: {comparison.report_b.date}</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/50 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Overall Score Delta</span>
                  {comparison.score_delta !== null ? (
                    <>
                      <div className={`text-2xl font-black font-heading mt-1 flex items-center gap-1 ${
                        comparison.score_delta >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {comparison.score_delta >= 0 ? "+" : ""}{comparison.score_delta}
                      </div>
                      <span className="text-[10px] text-slate-500">Points shifted</span>
                    </>
                  ) : (
                    <div className="text-slate-500 text-sm font-semibold">No scores to compare</div>
                  )}
                </div>
              </div>

              {/* Delta Comparison Grid */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs">
                      <th className="py-3 px-4">Biomarker</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-center">Value (A)</th>
                      <th className="py-3 px-4 text-center">Value (B)</th>
                      <th className="py-3 px-4 text-center">Delta Shift</th>
                      <th className="py-3 px-4 text-center">Recommended Range</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {comparison.biomarker_deltas.map(d => {
                      const hasDelta = d.pct_change !== null;
                      const isWorsening = (d.pct_change !== null && (
                        (d.pct_change > 0 && !HIGHER_IS_BETTER.has(d.name.toLowerCase())) ||
                        (d.pct_change < 0 && HIGHER_IS_BETTER.has(d.name.toLowerCase()))
                      ));

                      return (
                        <tr key={d.name} className="hover:bg-slate-50/50 transition">
                          <td className="py-3 px-4 font-bold text-slate-800">{d.name}</td>
                          <td className="py-3 px-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                              {d.group}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {d.value_a !== null ? (
                              <span className={`font-semibold ${
                                d.risk_a === "Critical" ? "text-red-500" : d.risk_a === "Moderate" ? "text-amber-500" : "text-slate-600"
                              }`}>
                                {d.value_a} <span className="text-[10px] text-slate-400 font-normal">{d.unit}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 font-light">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {d.value_b !== null ? (
                              <span className={`font-semibold ${
                                d.risk_b === "Critical" ? "text-red-500" : d.risk_b === "Moderate" ? "text-amber-500" : "text-slate-600"
                              }`}>
                                {d.value_b} <span className="text-[10px] text-slate-400 font-normal">{d.unit}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 font-light">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {hasDelta ? (
                              <span className={`inline-flex items-center gap-0.5 text-xs font-extrabold px-2 py-0.5 rounded ${
                                isWorsening ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                              }`}>
                                {d.pct_change! >= 0 ? "+" : ""}{d.pct_change}%
                              </span>
                            ) : d.only_in_a ? (
                              <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded">Only in A</span>
                            ) : d.only_in_b ? (
                              <span className="text-[10px] text-blue-500 font-semibold bg-blue-50 px-2 py-0.5 rounded">Added in B</span>
                            ) : (
                              <span className="text-slate-300 font-light">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center text-xs text-slate-500 font-semibold">
                            {d.reference.min !== null || d.reference.max !== null ? (
                              <span>
                                {d.reference.min ?? 0} – {d.reference.max ?? "∞"} {d.unit}
                              </span>
                            ) : (
                              <span className="text-slate-300">No range bound</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 text-slate-400 text-center py-10 rounded-2xl text-xs">
              Select two unique reports above to generate side-by-side delta computations.
            </div>
          )}
        </div>

        {/* ── Section 5: Clinical Alerts & Risk progression ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Anomaly / Rapid shift Feed */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 font-heading">
                Clinical Alerts Feed
              </h2>
              <p className="text-xs text-slate-400">Z-Score anomalies and extreme velocity shifts</p>
            </div>

            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              {alerts.length > 0 ? (
                alerts.map((a, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`flex items-start gap-4 p-4 rounded-2xl border ${
                      a.severity === "critical" 
                        ? "bg-red-50/50 border-red-200/60 text-red-900" 
                        : "bg-amber-50/40 border-amber-200/50 text-amber-900"
                    }`}
                  >
                    <div className={`p-2 rounded-xl mt-0.5 ${
                      a.severity === "critical" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                    }`}>
                      {a.type === "anomaly" ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm uppercase">{a.marker}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          a.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {a.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium">{a.message}</p>
                      <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                        <Calendar size={10} /> Date Flagged: {a.date}
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400 text-center">
                  <CheckCircle2 size={24} className="text-emerald-500" />
                  <p className="text-xs font-semibold">Zero physiological anomalies detected across your historical timeline.</p>
                </div>
              )}
            </div>
          </div>

          {/* Clinical groupings reference guide */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6 flex flex-col">
            <div>
              <h2 className="text-xl font-bold text-slate-800 font-heading">
                Clinical Categories
              </h2>
              <p className="text-xs text-slate-400">Total detected biomarkers grouped by physiological sub-systems</p>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto max-h-[300px]">
              {Object.entries(data!.groups).map(([grp, markers], idx) => (
                <div key={grp} className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-bold text-slate-700">{grp}</h4>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {markers.slice(0, 3).join(", ")} {markers.length > 3 ? "..." : ""}
                    </p>
                  </div>
                  <span className="text-xs font-extrabold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-xl">
                    {markers.length} {markers.length === 1 ? "marker" : "markers"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Section 6: Comprehensive Biomarker Historical Grid ── */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 font-heading">
              Comprehensive Historical Database
            </h2>
            <p className="text-xs text-slate-400">Historical summary values of all tracked biomarkers and risk classifications</p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs">
                  <th className="py-3 px-4">Biomarker</th>
                  <th className="py-3 px-4">Clinical Category</th>
                  <th className="py-3 px-4 text-center">Readings Count</th>
                  <th className="py-3 px-4 text-center">Latest Reading</th>
                  <th className="py-3 px-4 text-center">Trend Trajectory</th>
                  <th className="py-3 px-4 text-center">Risk status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(trendData).map(([name, detail]) => {
                  const latestPoint = detail.time_series[detail.time_series.length - 1];

                  return (
                    <tr key={name} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-4 font-bold text-slate-800">{name}</td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                          {detail.group}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-slate-600 font-bold">{detail.reading_count}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-700">
                        {detail.latest_value} <span className="text-[10px] text-slate-400 font-normal">{detail.latest_unit}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded ${
                          detail.trend === "improving" ? "bg-emerald-50 text-emerald-600"
                          : detail.trend === "worsening" ? "bg-rose-50 text-rose-600"
                          : "bg-slate-50 text-slate-600"
                        }`}>
                          {detail.trend === "improving" ? <TrendingUp size={12} /> 
                           : detail.trend === "worsening" ? <TrendingDown size={12} />
                           : <CheckCircle2 size={12} />}
                          {detail.trend}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          latestPoint.risk_category === "Critical" ? "bg-red-50 text-red-500 border border-red-200"
                          : latestPoint.risk_category === "Moderate" ? "bg-amber-50 text-amber-600 border border-amber-200"
                          : "bg-emerald-50 text-emerald-500 border border-emerald-200"
                        }`}>
                          {latestPoint.risk_category}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
