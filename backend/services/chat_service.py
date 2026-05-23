"""
chat_service.py — Conversational RAG pipeline for "Chat with Your Report".

Architecture:
  ┌─────────────────────────────────────────────────────────────────┐
  │  User Question                                                  │
  │       │                                                         │
  │       ▼                                                         │
  │  _safety_check()      ← detect off-topic / dangerous queries   │
  │       │                                                         │
  │       ▼                                                         │
  │  _build_context()     ← assemble RAG context from report data  │
  │       │   • biomarkers + risk levels                            │
  │       │   • health score                                        │
  │       │   • AI summary                                          │
  │       │   • patient demographics                                │
  │       │   • conversation history (last N turns)                 │
  │       ▼                                                         │
  │  _retrieve_relevant() ← semantic keyword search over biomarkers │
  │       │                  to focus the prompt on what's relevant  │
  │       ▼                                                         │
  │  Groq streaming call  ← temperature=0.4, streaming=True        │
  │       │                                                         │
  │       ▼                                                         │
  │  _post_process()      ← inject safety disclaimer if needed     │
  │       │                                                         │
  │       ▼                                                         │
  │  SSE stream to client                                           │
  └─────────────────────────────────────────────────────────────────┘

Hallucination safeguards:
  1. Context is ONLY real data from the DB — never synthesised.
  2. System prompt explicitly forbids inventing lab values.
  3. Safety check blocks requests for diagnoses or treatment decisions.
  4. Disclaimer is appended to every response involving critical markers.
  5. Uncertainty hedges ("based on your report...", "consult your doctor...")
     are enforced via the system prompt.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

logger = logging.getLogger(__name__)

GROQ_API_KEY   = os.getenv("GROQ_API_KEY", "")
CHAT_MODEL     = os.getenv("CHAT_MODEL", "llama-3.3-70b-versatile")
MAX_HISTORY    = 10   # Number of past turns to include in context
MAX_CONTEXT_BIOMARKERS = 20  # Cap to avoid token overflow

# ── Groq client ───────────────────────────────────────────────────────────────
try:
    from groq import AsyncGroq
    _async_client: Optional[AsyncGroq] = AsyncGroq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
    GROQ_AVAILABLE = bool(GROQ_API_KEY and _async_client)
except Exception as _e:
    logger.warning("Groq async client init failed: %s", _e)
    _async_client = None
    GROQ_AVAILABLE = False


# ── System prompt ─────────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """You are MediScan AI Assistant — a knowledgeable, empathetic medical report companion.

## YOUR ROLE
You help patients understand their own lab results that have already been extracted from their uploaded medical report. You explain what values mean, why they might be abnormal, what lifestyle changes can help, and when to seek medical care.

## CRITICAL RULES (NEVER VIOLATE)
1. ONLY discuss biomarkers and values that are explicitly listed in the PATIENT CONTEXT below.
2. NEVER invent, assume, or fabricate lab values or medical history not in the context.
3. NEVER make a diagnosis. Use language like "your results suggest", "this may indicate", "it would be worth discussing with your doctor".
4. ALWAYS end responses involving Critical or abnormal markers with: "⚠️ Please consult your doctor for a proper evaluation."
5. If asked about something not in the patient's report, say: "That test wasn't in your uploaded report. I can only discuss the values that were extracted."
6. For questions about medications, dosages, or treatment plans: decline and recommend a doctor.
7. Keep responses clear, warm, and jargon-free. Use bullet points for lists.
8. When uncertain, say so explicitly — never guess medical values.

## RESPONSE STYLE
- Conversational and empathetic, not clinical
- Use the patient's actual values when explaining (e.g. "Your LDL is 145 mg/dL")
- Provide actionable lifestyle advice when appropriate
- Max 250 words unless a complex question demands more
- Use markdown: **bold** for emphasis, bullet lists for steps
"""

# ── Safety filter ─────────────────────────────────────────────────────────────
_BLOCKED_PATTERNS = [
    r"\b(prescribe|prescription|medication dose|how much.*mg|take.*pill)\b",
    r"\b(diagnose|diagnosis|do i have|am i sick|terminal|cancer|die)\b",
    r"\b(illegal|drug|narcotic|opioid)\b",
    r"\b(suicide|self.harm|hurt myself)\b",
]
_BLOCKED_RE = re.compile("|".join(_BLOCKED_PATTERNS), re.IGNORECASE)

_DISCLAIMER = (
    "\n\n---\n"
    "*⚠️ This is AI-generated information for educational purposes only — "
    "not a medical diagnosis. Always consult a qualified healthcare professional "
    "before making any health decisions.*"
)


def _safety_check(question: str) -> Optional[str]:
    """
    Return a refusal message if the question is unsafe/out-of-scope,
    or None if it's safe to proceed.
    """
    if _BLOCKED_RE.search(question):
        return (
            "I'm not able to provide advice on medications, dosages, or diagnoses. "
            "Please consult your doctor or pharmacist for that guidance. "
            "I'm here to help you understand your lab report values! 🏥"
        )
    return None


# ── Context builder ───────────────────────────────────────────────────────────

def _format_biomarker_context(biomarkers: List[Dict[str, Any]]) -> str:
    """Render biomarkers as a compact, structured text block for the prompt."""
    if not biomarkers:
        return "No biomarkers available."

    lines = ["BIOMARKER RESULTS:"]
    # Sort: Critical first, then Moderate, then Normal
    priority = {"Critical": 0, "Moderate": 1, "Normal": 2}
    sorted_bm = sorted(biomarkers, key=lambda b: priority.get(b.get("risk_category", "Normal"), 2))

    for bm in sorted_bm[:MAX_CONTEXT_BIOMARKERS]:
        name  = bm.get("marker_name", "Unknown")
        val   = bm.get("extracted_value") or bm.get("value")
        unit  = bm.get("unit", "")
        risk  = bm.get("risk_category", "Normal")
        expl  = bm.get("ai_explanation", "")
        ref_lo = bm.get("ref_low")
        ref_hi = bm.get("ref_high")

        ref_str = ""
        if ref_lo is not None and ref_hi is not None:
            ref_str = f" [ref: {ref_lo}–{ref_hi} {unit}]"
        elif ref_hi is not None:
            ref_str = f" [ref: <{ref_hi} {unit}]"
        elif ref_lo is not None:
            ref_str = f" [ref: >{ref_lo} {unit}]"

        status_icon = "🔴" if risk == "Critical" else "🟡" if risk == "Moderate" else "🟢"
        lines.append(f"  {status_icon} {name}: {val} {unit}{ref_str} — {risk}")
        if expl:
            lines.append(f"     ↳ {expl[:120]}{'...' if len(expl) > 120 else ''}")

    return "\n".join(lines)


def _retrieve_relevant_biomarkers(
    question: str,
    biomarkers: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Simple keyword-based semantic retrieval over biomarker names.
    Returns the subset of biomarkers most relevant to the question.
    Falls back to all biomarkers if no match found.

    In a production system with a vector DB (e.g. ChromaDB, Pinecone),
    this would use cosine similarity over embeddings instead.
    """
    q_lower = question.lower()

    # Keyword aliases for common biomarker query terms
    aliases: Dict[str, List[str]] = {
        "cholesterol": ["ldl", "hdl", "cholesterol", "triglycerides", "lipid"],
        "sugar":       ["glucose", "hba1c", "blood sugar", "diabetes", "glyc"],
        "thyroid":     ["tsh", "thyroid"],
        "kidney":      ["creatinine", "urea", "uric acid", "kidney"],
        "liver":       ["alt", "ast", "bilirubin", "alkaline phosphatase", "liver"],
        "blood":       ["hemoglobin", "wbc", "rbc", "platelet", "hb", "hgb"],
        "vitamin":     ["vitamin d", "vitamin b12", "ferritin", "iron"],
        "heart":       ["ldl", "hdl", "cholesterol", "triglycerides", "ecg"],
        "electrolyte": ["sodium", "potassium", "calcium"],
        "iron":        ["iron", "ferritin", "hemoglobin"],
    }

    # Expand query with aliases
    expanded_terms = set(q_lower.split())
    for concept, terms in aliases.items():
        if concept in q_lower:
            expanded_terms.update(terms)

    # Score each biomarker by how many terms appear in its name
    scored = []
    for bm in biomarkers:
        name_lower = bm.get("marker_name", "").lower()
        score = sum(1 for term in expanded_terms if term in name_lower)
        # Also boost critical/moderate markers (they're more likely to be discussed)
        if bm.get("risk_category") in ("Critical", "Moderate"):
            score += 0.5
        scored.append((score, bm))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = [bm for score, bm in scored if score > 0]

    # Always include all abnormal markers regardless of relevance
    abnormal = [bm for bm in biomarkers if bm.get("risk_category") in ("Critical", "Moderate")]
    abnormal_names = {bm.get("marker_name") for bm in abnormal}
    for bm in top:
        if bm.get("marker_name") not in abnormal_names:
            abnormal.append(bm)

    return abnormal if abnormal else biomarkers  # fallback: all markers


def build_context(
    report: Dict[str, Any],
    biomarkers: List[Dict[str, Any]],
    question: str,
    patient_info: Optional[Dict] = None,
) -> str:
    """
    Assemble the complete RAG context block injected into the prompt.

    Includes: patient demographics, health score, AI summary, relevant biomarkers.
    """
    sections = ["=== PATIENT CONTEXT ==="]

    # Demographics
    pi = patient_info or {}
    demo_parts = []
    if pi.get("name") and pi["name"] != "Unknown":
        demo_parts.append(f"Name: {pi['name']}")
    if pi.get("age") and pi["age"] != "Unknown":
        demo_parts.append(f"Age: {pi['age']}")
    if pi.get("gender") and pi["gender"] != "Unknown":
        demo_parts.append(f"Gender: {pi['gender']}")
    if demo_parts:
        sections.append("PATIENT: " + " | ".join(demo_parts))

    # Health score
    score = report.get("overall_health_score", 100)
    tier  = "Good" if score >= 70 else "Moderate concern" if score >= 40 else "Needs attention"
    sections.append(f"HEALTH SCORE: {score}/100 ({tier})")

    # AI summary
    summary = report.get("ai_summary", "")
    if summary:
        sections.append(f"\nAI SUMMARY:\n{summary[:500]}")

    # Relevant biomarkers (semantic retrieval)
    relevant_bm = _retrieve_relevant_biomarkers(question, biomarkers)
    sections.append("\n" + _format_biomarker_context(relevant_bm))

    # Abnormal summary for quick reference
    critical = [b for b in biomarkers if b.get("risk_category") == "Critical"]
    moderate = [b for b in biomarkers if b.get("risk_category") == "Moderate"]
    if critical:
        names = ", ".join(b.get("marker_name", "") for b in critical)
        sections.append(f"\n⚠️ CRITICAL MARKERS: {names}")
    if moderate:
        names = ", ".join(b.get("marker_name", "") for b in moderate)
        sections.append(f"⚡ MODERATE MARKERS: {names}")

    sections.append("=== END CONTEXT ===")
    return "\n".join(sections)


# ── Message history formatting ────────────────────────────────────────────────

def _format_history(history: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Convert frontend conversation history to Groq message format.
    Truncates to MAX_HISTORY turns to stay within context limits.

    history format: [{"role": "user"|"assistant", "content": "..."}]
    """
    # Keep the most recent MAX_HISTORY messages
    trimmed = history[-MAX_HISTORY:] if len(history) > MAX_HISTORY else history
    return [{"role": m["role"], "content": m["content"]} for m in trimmed]


# ── Public streaming API ──────────────────────────────────────────────────────

async def stream_chat_response(
    question:     str,
    report:       Dict[str, Any],
    biomarkers:   List[Dict[str, Any]],
    history:      List[Dict[str, str]],
    patient_info: Optional[Dict] = None,
) -> AsyncGenerator[str, None]:
    """
    Stream a chat response as Server-Sent Events (SSE) data chunks.

    Each yielded value is a raw SSE line: "data: <json>\n\n"

    JSON payload per chunk:
      {"type": "chunk",    "content": "..."}   — text token
      {"type": "done",     "content": ""}       — stream complete
      {"type": "error",    "content": "..."}    — error message
      {"type": "safety",   "content": "..."}    — safety refusal
    """
    def _sse(payload: dict) -> str:
        return f"data: {json.dumps(payload)}\n\n"

    # ── Safety check ──────────────────────────────────────────────────────────
    refusal = _safety_check(question)
    if refusal:
        yield _sse({"type": "safety", "content": refusal})
        yield _sse({"type": "done",   "content": ""})
        return

    # ── Check Groq availability ───────────────────────────────────────────────
    if not GROQ_AVAILABLE or not _async_client:
        fallback = _offline_response(question, biomarkers)
        yield _sse({"type": "chunk", "content": fallback})
        yield _sse({"type": "done",  "content": ""})
        return

    # ── Build context + messages ──────────────────────────────────────────────
    from services.medical_rag import build_rag_prompt_context
    rag_context, citations = build_rag_prompt_context(question, top_k=2)

    # Yield citations first for UI rendering
    if citations:
        yield _sse({"type": "citations", "content": citations})

    context   = build_context(report, biomarkers, question, patient_info)
    if rag_context:
        context += f"\n\n{rag_context}"

    formatted = _format_history(history)

    # Prepend context as the first user+assistant exchange for grounding
    context_message = {
        "role": "user",
        "content": (
            f"Here is the patient's medical report context. Use ONLY this data "
            f"when answering questions:\n\n{context}\n\n"
            f"Acknowledge you have the context."
        ),
    }
    context_ack = {
        "role": "assistant",
        "content": (
            "Understood. I have reviewed the patient's medical report. "
            "I'll answer questions based only on the data provided. "
            "How can I help you understand your results?"
        ),
    }

    messages = [
        context_message,
        context_ack,
        *formatted,
        {"role": "user", "content": question},
    ]

    # ── Determine if we need to append disclaimer ─────────────────────────────
    has_critical = any(
        b.get("risk_category") == "Critical" for b in biomarkers
    )
    question_involves_abnormal = any(
        b.get("marker_name", "").lower() in question.lower()
        for b in biomarkers
        if b.get("risk_category") in ("Critical", "Moderate")
    )
    needs_disclaimer = has_critical or question_involves_abnormal

    # ── Stream from Groq ──────────────────────────────────────────────────────
    try:
        logger.info("[Chat] Streaming response for report, question length=%d", len(question))

        stream = await _async_client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "system", "content": _SYSTEM_PROMPT}] + messages,
            temperature=0.4,      # Slightly creative but grounded
            max_tokens=600,
            top_p=0.9,
            stream=True,
        )

        full_response = []
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                token = delta.content
                full_response.append(token)
                yield _sse({"type": "chunk", "content": token})

        # Append disclaimer if warranted and not already present
        response_text = "".join(full_response)
        if needs_disclaimer and "consult your doctor" not in response_text.lower():
            yield _sse({"type": "chunk", "content": _DISCLAIMER})

        yield _sse({"type": "done", "content": ""})
        logger.info("[Chat] Stream complete, %d chars", len(response_text))

    except Exception as exc:
        logger.error("[Chat] Groq streaming error: %s", exc)
        # Graceful fallback — don't leave the user hanging
        fallback = _offline_response(question, biomarkers)
        yield _sse({"type": "chunk", "content": fallback})
        yield _sse({"type": "done",  "content": ""})


# ── Offline fallback (no Groq) ────────────────────────────────────────────────

def _offline_response(question: str, biomarkers: List[Dict[str, Any]]) -> str:
    """
    Rule-based fallback when Groq is unavailable.
    Provides basic, safe canned responses about the user's biomarkers.
    """
    q = question.lower()
    abnormal = [b for b in biomarkers if b.get("risk_category") in ("Critical", "Moderate")]

    if not abnormal:
        return (
            "Your report shows all markers within normal ranges — great news! "
            "Keep up with regular check-ups and a healthy lifestyle. "
            "For specific questions, please consult your doctor."
        )

    names = ", ".join(b.get("marker_name", "") for b in abnormal[:3])
    return (
        f"Based on your report, the following markers need attention: **{names}**. "
        "I'm currently unable to provide a detailed AI response. "
        "Please consult your doctor to discuss these results. "
        "\n\n*AI chat is unavailable — check your GROQ_API_KEY configuration.*"
    )


# ── Non-streaming single response (for history/summary use) ──────────────────

async def get_chat_response(
    question:     str,
    report:       Dict[str, Any],
    biomarkers:   List[Dict[str, Any]],
    history:      List[Dict[str, str]],
    patient_info: Optional[Dict] = None,
) -> str:
    """Non-streaming variant — collects the full response and returns it."""
    full = []
    async for chunk_sse in stream_chat_response(
        question, report, biomarkers, history, patient_info
    ):
        # Parse SSE line
        if chunk_sse.startswith("data: "):
            try:
                payload = json.loads(chunk_sse[6:])
                if payload.get("type") == "chunk":
                    full.append(payload["content"])
            except Exception:
                pass
    return "".join(full)


def get_chat_service_status() -> Dict[str, Any]:
    """Health-check for the chat service."""
    return {
        "groq_available": GROQ_AVAILABLE,
        "chat_model":     CHAT_MODEL,
        "max_history":    MAX_HISTORY,
        "streaming":      True,
    }
