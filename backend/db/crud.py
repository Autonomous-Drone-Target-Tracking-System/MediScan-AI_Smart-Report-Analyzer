import json
from .database import get_connection
from typing import List, Dict, Any


def insert_report(document_url: str, user_id: int = 1) -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO reports (user_id, document_url) VALUES (?, ?)",
        (user_id, document_url),
    )
    report_id = cur.lastrowid
    conn.commit()
    conn.close()
    return report_id


def update_health_score(report_id: int, score: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE reports SET overall_health_score = ? WHERE report_id = ?",
        (score, report_id),
    )
    conn.commit()
    conn.close()


def persist_analysis_metadata(report_id: int, ai_summary: str, recommendations: List[str]):
    """Persist ai_summary and recommendations to the reports table."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE reports SET ai_summary = ?, recommendations = ? WHERE report_id = ?",
        (ai_summary, json.dumps(recommendations), report_id),
    )
    conn.commit()
    conn.close()


def insert_biomarkers(report_id: int, biomarkers: List[Dict[str, Any]]):
    conn = get_connection()
    cur = conn.cursor()
    for b in biomarkers:
        cur.execute(
            """INSERT INTO biomarkers
               (report_id, marker_name, extracted_value, unit, risk_category, ai_explanation)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                report_id,
                b.get("marker_name"),
                b.get("value"),
                b.get("unit"),
                b.get("risk_category", "Normal"),
                b.get("ai_explanation", ""),
            ),
        )
    conn.commit()
    conn.close()


def get_report_by_id(report_id: int) -> Dict[str, Any] | None:
    conn = get_connection()
    cur = conn.cursor()
    row = cur.execute(
        "SELECT * FROM reports WHERE report_id = ?", (report_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_reports(limit: int = 50) -> List[Dict[str, Any]]:
    """Return a list of all reports ordered by most recent first."""
    conn = get_connection()
    cur = conn.cursor()
    rows = cur.execute(
        """SELECT report_id, upload_timestamp, document_url,
                  overall_health_score, ai_summary
           FROM reports
           ORDER BY report_id DESC
           LIMIT ?""",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_biomarkers_by_report_id(report_id: int) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT * FROM biomarkers WHERE report_id = ?", (report_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
