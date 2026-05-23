"use client";

/**
 * ChatAssistant.tsx — Floating AI chat assistant for MediScan AI.
 *
 * Features:
 *  - Floating button (bottom-right) that expands to a full chat panel
 *  - Streaming SSE responses with live token rendering
 *  - Markdown rendering (bold, bullets, code)
 *  - Typing indicator (animated dots)
 *  - Conversational memory (history sent to backend)
 *  - Suggested starter questions based on report data
 *  - Safety disclaimer on every critical response
 *  - Mobile-responsive: full-screen on small viewports
 *  - Framer Motion entrance/exit animations
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAuthHeaders } from "@/utils/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Citation {
  chunk_id: string;
  source: string;
  url: string;
  citation: string;
  trust_score: number;
  relevance_score: number;
  category: string;
  snippet: string;
}

interface Message {
  id:        string;
  role:      "user" | "assistant";
  content:   string;
  isStreaming?: boolean;
  isSafety?:   boolean;
  isError?:    boolean;
  citations?:  Citation[];
}

interface Biomarker {
  marker_name:     string;
  extracted_value: number | null;
  unit:            string;
  risk_category:   string;
  ref_low?:        number;
  ref_high?:       number;
}

interface ChatAssistantProps {
  reportId:    number;
  biomarkers:  Biomarker[];
  healthScore: number;
  patientInfo?: { name?: string; age?: string; gender?: string };
}

// ── Suggested questions ────────────────────────────────────────────────────────

function getSuggestedQuestions(biomarkers: Biomarker[]): string[] {
  const critical = biomarkers.filter(b => b.risk_category === "Critical");
  const moderate = biomarkers.filter(b => b.risk_category === "Moderate");
  const abnormal = [...critical, ...moderate];

  const base = [
    "Give me an overview of my health report.",
    "What are the most important findings in my report?",
    "What lifestyle changes should I make?",
  ];

  const specific: string[] = [];
  for (const bm of abnormal.slice(0, 3)) {
    const n = bm.marker_name;
    if (/ldl|cholesterol/i.test(n))       specific.push("Why is my LDL high and what foods should I avoid?");
    else if (/triglycerides/i.test(n))    specific.push("What reduces triglycerides naturally?");
    else if (/hba1c|glucose|sugar/i.test(n)) specific.push("Should I worry about my blood sugar levels?");
    else if (/vitamin d/i.test(n))        specific.push("Is my Vitamin D dangerously low?");
    else if (/hemoglobin|hb/i.test(n))    specific.push("What does low hemoglobin mean for me?");
    else if (/tsh|thyroid/i.test(n))      specific.push("What does my TSH result mean?");
    else if (/creatinine|urea/i.test(n))  specific.push("How can I protect my kidney health?");
    else specific.push(`What does my ${n} result mean?`);
  }

  return [...new Set([...specific, ...base])].slice(0, 5);
}

// ── Markdown renderer (lightweight, no library needed) ─────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,     "<em>$1</em>")
    .replace(/`(.+?)`/g,       "<code style=\"background:#F1F5F9;padding:1px 5px;border-radius:4px;font-size:0.88em\">$1</code>")
    .replace(/^#{1,3}\s(.+)$/gm, "<strong style=\"font-size:1.05em\">$1</strong>")
    .replace(/^[•\-\*]\s(.+)$/gm, "<span style=\"display:block;padding-left:12px\">• $1</span>")
    .replace(/^\d+\.\s(.+)$/gm,   "<span style=\"display:block;padding-left:12px\">$1</span>")
    .replace(/---/g, "<hr style=\"border:none;border-top:1px solid #E2E8F0;margin:8px 0\">")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g,   "<br>");
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          style={{
            width: 7, height: 7,
            borderRadius: "50%",
            background: "var(--color-primary)",
            opacity: 0.7,
          }}
          animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const [expandedCitation, setExpandedCitation] = useState<string | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      style={{
        display:       "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom:  10,
        gap:           8,
        alignItems:    "flex-end",
      }}
    >
      {/* Avatar — AI only */}
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #2563EB, #06B6D4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "#fff", fontWeight: 700, boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
        }}>
          🩺
        </div>
      )}

      <div style={{
        maxWidth:     "82%",
        padding:      isUser ? "10px 14px" : "12px 16px",
        borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        background:   isUser
          ? "linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)"
          : msg.isSafety
            ? "#FFF7ED"
            : msg.isError
              ? "#FEF2F2"
              : "#F8FAFC",
        color:        isUser ? "#fff" : msg.isSafety ? "#9A3412" : "#0F172A",
        fontSize:     13.5,
        lineHeight:   1.65,
        boxShadow:    isUser
          ? "0 2px 12px rgba(37,99,235,0.25)"
          : "0 1px 4px rgba(0,0,0,0.06)",
        border:       !isUser ? "1px solid #E2E8F0" : "none",
        wordBreak:    "break-word",
      }}>
        {msg.isStreaming && !msg.content ? (
          <TypingDots />
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
          />
        )}

        {/* Dynamic Expandable RAG medical citations */}
        {!isUser && msg.citations && msg.citations.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1.5px solid #E2E8F0" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
              📚 Literature References:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {msg.citations.map(c => {
                const isExpanded = expandedCitation === c.chunk_id;
                return (
                  <div key={c.chunk_id} style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                    <button
                      type="button"
                      onClick={() => setExpandedCitation(isExpanded ? null : c.chunk_id)}
                      style={{
                        background: isExpanded ? "#EFF6FF" : "#F1F5F9",
                        border: "1px solid #E2E8F0",
                        borderRadius: 8,
                        padding: "5px 8px",
                        fontSize: 11,
                        color: "#2563EB",
                        fontWeight: 600,
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "all 0.15s",
                        width: "100%",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        🛡️ {c.source} 
                        <span style={{ color: "#10B981", fontSize: 9, fontWeight: 700 }}>
                          ({Math.round(c.trust_score * 100)}% Trust)
                        </span>
                      </span>
                      <span style={{ fontSize: 9.5, color: "#64748B", fontWeight: 700 }}>
                        {isExpanded ? "▲ Hide Context" : "▼ View Citation"}
                      </span>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          style={{
                            overflow: "hidden",
                            background: "#F8FAFC",
                            border: "1px dashed #CBD5E1",
                            borderRadius: 8,
                            padding: 8,
                            marginTop: 4,
                            marginBottom: 4,
                            fontSize: 11,
                            color: "#475569",
                          }}
                        >
                          <div style={{ fontWeight: 700, color: "#1E293B", marginBottom: 2 }}>{c.citation}</div>
                          <div style={{ fontStyle: "italic", lineHeight: 1.4, marginBottom: 6 }}>"{c.snippet}"</div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9.5, color: "#64748B" }}>
                            <span>Match relevance: <strong style={{ color: "#3B82F6" }}>{Math.round(c.relevance_score * 100)}%</strong></span>
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: "#2563EB",
                                textDecoration: "underline",
                                fontWeight: 700,
                              }}
                            >
                              Official Source ↗
                            </a>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Avatar — user */}
      {isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
          background: "#E0E7FF",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#3730A3",
        }}>
          You
        </div>
      )}
    </motion.div>
  );
}

// ── Main ChatAssistant component ───────────────────────────────────────────────

export default function ChatAssistant({
  reportId,
  biomarkers,
  healthScore,
  patientInfo,
}: ChatAssistantProps) {
  const [isOpen,      setIsOpen]      = useState(false);
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState("");
  const [streaming,   setStreaming]   = useState(false);
  const [hasOpened,   setHasOpened]   = useState(false);

  const scrollRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  const suggestions = getSuggestedQuestions(biomarkers);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [isOpen]);

  // Welcome message on first open
  const handleOpen = useCallback(() => {
    setIsOpen(true);
    if (!hasOpened) {
      setHasOpened(true);
      const abnormal = biomarkers.filter(b =>
        b.risk_category === "Critical" || b.risk_category === "Moderate"
      );
      let welcome = "👋 Hi! I'm your **MediScan AI Assistant**.\n\n";
      welcome += `I've analysed your report (Health Score: **${healthScore}/100**). `;
      if (abnormal.length > 0) {
        const names = abnormal.slice(0, 3).map(b => b.marker_name).join(", ");
        welcome += `I noticed ${abnormal.length} marker(s) need attention: **${names}**.\n\n`;
      } else {
        welcome += "All your markers are within normal range! 🎉\n\n";
      }
      welcome += "Ask me anything about your results — I'm here to help you understand them.";

      setMessages([{
        id:      "welcome",
        role:    "assistant",
        content: welcome,
      }]);
    }
  }, [hasOpened, biomarkers, healthScore]);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg: Message = {
      id:      `u-${Date.now()}`,
      role:    "user",
      content: text.trim(),
    };
    const assistantMsgId = `a-${Date.now()}`;
    const assistantMsg: Message = {
      id:        assistantMsgId,
      role:      "assistant",
      content:   "",
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    // Build history (exclude welcome msg, current pair)
    const history = messages
      .filter(m => m.id !== "welcome" && !m.isError)
      .map(m => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_URL}/api/chat/${reportId}/stream`, {
        method:  "POST",
        headers: { 
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body:    JSON.stringify({
          question:     text.trim(),
          history,
          patient_info: patientInfo ?? {},
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server error: ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";  // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));

            if (payload.type === "citations") {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, citations: payload.content }
                  : m
              ));
            } else if (payload.type === "chunk") {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + payload.content, isStreaming: true }
                  : m
              ));
            } else if (payload.type === "safety") {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: payload.content, isStreaming: false, isSafety: true }
                  : m
              ));
            } else if (payload.type === "error") {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: payload.content || "An error occurred. Please try again.", isStreaming: false, isError: true }
                  : m
              ));
            } else if (payload.type === "done") {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, isStreaming: false } : m
              ));
            }
          } catch {
            // Ignore malformed JSON chunks
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: "Connection error. Please check your network and try again.", isStreaming: false, isError: true }
          : m
      ));
    } finally {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, isStreaming: false } : m
      ));
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages, reportId, patientInfo, streaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages(prev => prev.map(m =>
      m.isStreaming ? { ...m, isStreaming: false } : m
    ));
  };

  const handleClear = () => {
    setMessages([]);
    setHasOpened(false);
    handleOpen();
  };

  // ── Abnormal count for badge ───────────────────────────────────────────────
  const abnormalCount = biomarkers.filter(b =>
    b.risk_category === "Critical" || b.risk_category === "Moderate"
  ).length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Floating trigger button ── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{   scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{  scale: 0.95 }}
            onClick={handleOpen}
            aria-label="Open AI Health Assistant"
            style={{
              position:   "fixed",
              bottom:     24,
              right:      24,
              zIndex:     1000,
              width:      60,
              height:     60,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)",
              border:     "none",
              cursor:     "pointer",
              display:    "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow:  "0 4px 24px rgba(37,99,235,0.45)",
              fontSize:   26,
            }}
          >
            🩺
            {/* Abnormal count badge */}
            {abnormalCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={{
                  position:   "absolute",
                  top:        -2,
                  right:      -2,
                  width:      20,
                  height:     20,
                  borderRadius: "50%",
                  background: "#EF4444",
                  color:      "#fff",
                  fontSize:   11,
                  fontWeight: 700,
                  display:    "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border:     "2px solid #fff",
                }}
              >
                {abnormalCount}
              </motion.div>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Chat panel ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, scale: 0.92, y: 20, transformOrigin: "bottom right" }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{   opacity: 0, scale: 0.92, y: 20  }}
            transition={{ type: "spring", damping: 24, stiffness: 300 }}
            style={{
              position:     "fixed",
              bottom:       24,
              right:        24,
              zIndex:       1000,
              width:        "min(420px, calc(100vw - 32px))",
              height:       "min(640px, calc(100vh - 80px))",
              background:   "#FFFFFF",
              borderRadius: 24,
              boxShadow:    "0 24px 80px rgba(0,0,0,0.18), 0 4px 16px rgba(37,99,235,0.12)",
              display:      "flex",
              flexDirection: "column",
              overflow:     "hidden",
              border:       "1px solid rgba(37,99,235,0.12)",
            }}
          >
            {/* ── Header ── */}
            <div style={{
              background:    "linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)",
              padding:       "16px 20px",
              display:       "flex",
              alignItems:    "center",
              gap:           12,
              flexShrink:    0,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: "50%",
                background: "rgba(255,255,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20,
              }}>
                🩺
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
                  MediScan AI Assistant
                </div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 }}>
                  {streaming ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <motion.span
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                        style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#4ADE80" }}
                      />
                      Typing…
                    </span>
                  ) : (
                    "Powered by Groq · Report-aware AI"
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {/* Clear button */}
                <button
                  onClick={handleClear}
                  title="Clear chat"
                  style={{
                    background: "rgba(255,255,255,0.15)", border: "none",
                    borderRadius: 8, color: "#fff", cursor: "pointer",
                    padding: "5px 9px", fontSize: 12, fontWeight: 600,
                  }}
                >
                  Clear
                </button>
                {/* Close button */}
                <button
                  onClick={() => setIsOpen(false)}
                  aria-label="Close chat"
                  style={{
                    background: "rgba(255,255,255,0.15)", border: "none",
                    borderRadius: 8, color: "#fff", cursor: "pointer",
                    padding: "5px 9px", fontSize: 16,
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* ── Messages area ── */}
            <div
              ref={scrollRef}
              style={{
                flex:       1,
                overflowY:  "auto",
                padding:    "16px 14px",
                display:    "flex",
                flexDirection: "column",
                gap:        2,
                background: "#F8FAFC",
              }}
            >
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}

              {/* Suggested questions — show only when no user messages yet */}
              {messages.length <= 1 && suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  style={{ marginTop: 12 }}
                >
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: "#64748B",
                    textTransform: "uppercase", letterSpacing: 0.8,
                    marginBottom: 8, paddingLeft: 4,
                  }}>
                    Suggested Questions
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {suggestions.map((q, i) => (
                      <motion.button
                        key={i}
                        whileHover={{ scale: 1.02, backgroundColor: "#EFF6FF" }}
                        whileTap={{  scale: 0.98 }}
                        onClick={() => sendMessage(q)}
                        disabled={streaming}
                        style={{
                          background:   "#fff",
                          border:       "1px solid #CBD5E1",
                          borderRadius: 12,
                          padding:      "9px 13px",
                          textAlign:    "left",
                          cursor:       streaming ? "not-allowed" : "pointer",
                          fontSize:     12.5,
                          color:        "#334155",
                          lineHeight:   1.4,
                          transition:   "all 0.15s",
                          fontFamily:   "inherit",
                        }}
                      >
                        💬 {q}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* ── Input bar ── */}
            <div style={{
              padding:       "12px 14px",
              borderTop:     "1px solid #E2E8F0",
              background:    "#fff",
              flexShrink:    0,
            }}>
              {/* Safety disclaimer */}
              <div style={{
                fontSize:     10.5,
                color:        "#94A3B8",
                marginBottom: 8,
                textAlign:    "center",
                lineHeight:   1.4,
              }}>
                🔒 AI responses are for educational purposes. Always consult your doctor.
              </div>

              <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your results… (Enter to send)"
                  disabled={streaming}
                  rows={1}
                  style={{
                    flex:         1,
                    border:       "1.5px solid #CBD5E1",
                    borderRadius: 14,
                    padding:      "10px 14px",
                    fontSize:     13.5,
                    fontFamily:   "inherit",
                    resize:       "none",
                    outline:      "none",
                    lineHeight:   1.5,
                    maxHeight:    120,
                    overflowY:    "auto",
                    background:   streaming ? "#F8FAFC" : "#fff",
                    color:        "#0F172A",
                    transition:   "border-color 0.2s",
                  }}
                  onFocus={e  => (e.target.style.borderColor = "#2563EB")}
                  onBlur={e   => (e.target.style.borderColor = "#CBD5E1")}
                  onInput={e => {
                    const t = e.target as HTMLTextAreaElement;
                    t.style.height = "auto";
                    t.style.height = Math.min(t.scrollHeight, 120) + "px";
                  }}
                />

                {streaming ? (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={handleStop}
                    style={{
                      width:        42, height: 42,
                      borderRadius: "50%",
                      background:   "#FEE2E2",
                      border:       "none",
                      cursor:       "pointer",
                      display:      "flex",
                      alignItems:   "center",
                      justifyContent: "center",
                      fontSize:     18,
                      flexShrink:   0,
                    }}
                    title="Stop"
                  >
                    ⏹
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.06 }}
                    whileTap={{  scale: 0.92 }}
                    type="submit"
                    disabled={!input.trim()}
                    style={{
                      width:        42, height: 42,
                      borderRadius: "50%",
                      background:   input.trim()
                        ? "linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)"
                        : "#E2E8F0",
                      border:       "none",
                      cursor:       input.trim() ? "pointer" : "not-allowed",
                      display:      "flex",
                      alignItems:   "center",
                      justifyContent: "center",
                      fontSize:     18,
                      flexShrink:   0,
                      boxShadow:    input.trim() ? "0 2px 8px rgba(37,99,235,0.3)" : "none",
                      transition:   "all 0.2s",
                    }}
                    title="Send (Enter)"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M22 2L11 13" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </motion.button>
                )}
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
