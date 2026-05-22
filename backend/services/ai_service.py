"""
AI explanation service using Groq (Llama 3 / Mixtral) — fast, free-tier friendly.
Falls back to rule-based explanations if the API is unavailable.
"""

import os
from typing import List, Dict, Any
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

try:
    from groq import Groq
    _client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
    GROQ_AVAILABLE = bool(GROQ_API_KEY and _client)
except Exception as e:
    print(f"Groq init error: {e}")
    _client = None
    GROQ_AVAILABLE = False

# Use the current, most capable free-tier Groq model (llama3-8b-8192 was decommissioned)
MODEL = "llama-3.3-70b-versatile"


def _chat(prompt: str, max_tokens: int = 200) -> str:
    """Send a prompt to Groq and return the response text."""
    if not GROQ_AVAILABLE or not _client:
        return ""
    try:
        response = _client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a friendly, empathetic medical assistant. "
                        "Explain lab results in clear, simple English for non-medical users. "
                        "Be concise, accurate, and always recommend consulting a doctor. "
                        "Never diagnose — only explain and advise."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.4,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Groq API error: {e}")
        return ""


# ── Fallback explanations ──────────────────────────────────────────────────────
def _fallback_explanation(marker_name: str, value: float, unit: str, risk: str) -> str:
    if risk == "Normal":
        return f"Your {marker_name} level ({value} {unit}) is within the normal range. Great job maintaining your health!"
    elif risk == "Moderate":
        return (
            f"Your {marker_name} level ({value} {unit}) is slightly outside the normal range. "
            "This warrants a conversation with your doctor to understand what steps to take."
        )
    else:
        return (
            f"Your {marker_name} level ({value} {unit}) is significantly outside the normal range. "
            "Please consult your doctor as soon as possible for evaluation and guidance."
        )


def _fallback_summary(biomarkers: List[Dict], health_score: int) -> str:
    abnormal = [b for b in biomarkers if b.get("risk_category") != "Normal"]
    if not abnormal:
        return (
            f"Your overall health score is {health_score}/100. "
            "All measured biomarkers are within normal ranges — excellent! "
            "Keep up your healthy lifestyle and continue with regular check-ups."
        )
    names = ", ".join(b["marker_name"] for b in abnormal[:4])
    return (
        f"Your overall health score is {health_score}/100. "
        f"The following markers need attention: {names}. "
        "These findings don't necessarily indicate a serious condition, but they should be "
        "reviewed with your doctor to determine the appropriate next steps."
    )


def _fallback_recommendations(biomarkers: List[Dict]) -> List[str]:
    abnormal = [b for b in biomarkers if b.get("risk_category") != "Normal"]
    recs = []
    seen = set()
    for b in abnormal:
        name = b["marker_name"].lower()
        if ("ldl" in name or "cholesterol" in name) and "cholesterol" not in seen:
            recs.append("🥗 Reduce saturated fats — cut fried foods, red meat, and full-fat dairy to lower LDL cholesterol.")
            seen.add("cholesterol")
        elif ("hemoglobin" in name or "iron" in name or "ferritin" in name) and "iron" not in seen:
            recs.append("🥩 Boost iron intake — eat spinach, lentils, lean red meat, and iron-fortified cereals daily.")
            seen.add("iron")
        elif ("glucose" in name or "sugar" in name or "hba1c" in name) and "sugar" not in seen:
            recs.append("🍎 Manage blood sugar — choose low-glycemic foods, avoid sugary drinks, and exercise regularly.")
            seen.add("sugar")
        elif ("tsh" in name or "thyroid" in name) and "thyroid" not in seen:
            recs.append("💊 Follow up on thyroid levels — take prescribed medication consistently and retest in 3 months.")
            seen.add("thyroid")
        elif ("creatinine" in name or "urea" in name) and "kidney" not in seen:
            recs.append("💧 Stay well hydrated — drink 2–3 liters of water daily to support kidney function.")
            seen.add("kidney")
    while len(recs) < 3:
        defaults = [
            "🏃 Exercise regularly — 30 minutes of moderate activity (walking, swimming) at least 5 days a week.",
            "😴 Prioritize 7–8 hours of quality sleep nightly — rest is essential for overall health.",
            "🧘 Reduce stress — try meditation, deep breathing, or yoga to support your body's healing.",
        ]
        recs.append(defaults[len(recs) % len(defaults)])
    return recs[:3]


# ── Public API ─────────────────────────────────────────────────────────────────
def generate_biomarker_explanation(marker_name: str, value: float, unit: str, risk: str) -> str:
    """1–2 sentence plain-English explanation for a single biomarker."""
    prompt = (
        f"A patient's {marker_name} level is {value} {unit} (risk level: {risk}). "
        "In exactly 1–2 clear sentences, explain what this means and what the patient should know. "
        "Do not start with 'I' or repeat the marker name in the first word."
    )
    result = _chat(prompt, max_tokens=120)
    return result or _fallback_explanation(marker_name, value, unit, risk)


def generate_overall_summary(biomarkers: List[Dict[str, Any]], health_score: int) -> str:
    """3–4 sentence AI summary of the entire report."""
    abnormal = [b for b in biomarkers if b.get("risk_category") != "Normal"]
    total = len(biomarkers)

    if not abnormal:
        prompt = (
            f"A patient's lab report shows all {total} biomarkers within normal ranges. "
            f"Overall health score: {health_score}/100. "
            "Write a 2–3 sentence positive, encouraging health summary for the patient."
        )
    else:
        critical_names = [b["marker_name"] for b in abnormal if b.get("risk_category") == "Critical"]
        moderate_names = [b["marker_name"] for b in abnormal if b.get("risk_category") == "Moderate"]
        prompt = (
            f"Patient health score: {health_score}/100 (out of 100). "
            f"Critical markers: {', '.join(critical_names) or 'None'}. "
            f"Moderate markers: {', '.join(moderate_names) or 'None'}. "
            f"Total biomarkers tested: {total}. "
            "Write a 3–4 sentence health summary in simple language: explain the overall picture, "
            "which findings need most urgency, and strongly advise seeing a doctor."
        )

    result = _chat(prompt, max_tokens=220)
    return result or _fallback_summary(biomarkers, health_score)


def generate_recommendations(biomarkers: List[Dict[str, Any]]) -> List[str]:
    """3 specific, actionable lifestyle/diet recommendations."""
    abnormal = [b for b in biomarkers if b.get("risk_category") != "Normal"]

    if not abnormal:
        return [
            "🥗 Maintain a balanced diet rich in vegetables, whole grains, and lean proteins.",
            "🏃 Continue regular physical activity — at least 30 minutes of moderate exercise daily.",
            "💊 Keep up with your routine health check-ups and annual screenings.",
        ]

    marker_list = ", ".join(f"{b['marker_name']} ({b['risk_category']})" for b in abnormal[:5])
    prompt = (
        f"A patient has abnormal lab results: {marker_list}. "
        "Give exactly 3 specific, actionable lifestyle or diet recommendations as a numbered list. "
        "Each must be one concise sentence. Start each with a relevant emoji (food, exercise, or health). "
        "Be practical and specific, not generic."
    )
    result = _chat(prompt, max_tokens=250)

    if result:
        lines = [l.strip() for l in result.split("\n") if l.strip()]
        clean = []
        for line in lines:
            line = line.lstrip("0123456789.-) ").strip()
            if line and len(line) > 10:
                clean.append(line)
        if len(clean) >= 3:
            return clean[:3]

    return _fallback_recommendations(biomarkers)
