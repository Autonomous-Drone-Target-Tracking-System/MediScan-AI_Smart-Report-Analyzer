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


def mark_report_as_radiology(report_id: int, report_type: str):
    """Mark a report as a radiology scan and store its modality type."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE reports SET is_radiology = 1, report_type = ? WHERE report_id = ?",
        (report_type, report_id),
    )
    conn.commit()
    conn.close()


def mark_report_as_cardiac(report_id: int, report_type: str, heart_rate: int | None):
    """Mark a report as an ECG/Cardiac report and store heart rate."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE reports SET is_cardiac = 1, report_type = ?, heart_rate = ? WHERE report_id = ?",
        (report_type, heart_rate, report_id),
    )
    conn.commit()
    conn.close()


def mark_report_as_dicom(report_id: int, report_type: str):
    """Mark a report as a DICOM medical scan study."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE reports SET is_dicom = 1, report_type = ? WHERE report_id = ?",
        (report_type, report_id),
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


def insert_radiology_findings(report_id: int, findings: List[Dict[str, Any]]):
    """Persist extracted radiological structures, abnormalities, and UMLS CUIs."""
    conn = get_connection()
    cur = conn.cursor()
    for f in findings:
        cur.execute(
            """INSERT INTO radiology_findings
               (report_id, anatomical_structure, finding, abnormality_type, severity, confidence_score, is_uncertain, umls_cui)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                report_id,
                f.get("anatomical_structure"),
                f.get("finding"),
                f.get("abnormality_type"),
                f.get("severity", "Normal"),
                f.get("confidence_score", 1.0),
                1 if f.get("is_uncertain") else 0,
                f.get("umls_cui", "")
            )
        )
    conn.commit()
    conn.close()


def insert_cardiac_findings(report_id: int, findings: List[Dict[str, Any]]):
    """Persist extracted ECG rhythm segments, arrhythmia detections, and emergency indicators."""
    conn = get_connection()
    cur = conn.cursor()
    for f in findings:
        cur.execute(
            """INSERT INTO cardiac_findings
               (report_id, parameter_name, extracted_value, abnormality_type, severity, confidence_score, umls_cui, is_emergency)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                report_id,
                f.get("parameter_name"),
                f.get("extracted_value"),
                f.get("abnormality_type"),
                f.get("severity", "Normal"),
                f.get("confidence_score", 1.0),
                f.get("umls_cui", ""),
                1 if f.get("is_emergency") else 0
            )
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
                  overall_health_score, ai_summary, is_radiology, is_cardiac, is_dicom, report_type, heart_rate
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


def get_radiology_findings_by_report_id(report_id: int) -> List[Dict[str, Any]]:
    """Fetch radiology abnormalities and anatomies for a specific report."""
    conn = get_connection()
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT * FROM radiology_findings WHERE report_id = ?", (report_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_cardiac_findings_by_report_id(report_id: int) -> List[Dict[str, Any]]:
    """Fetch ECG arrhythmias and cardiovascular parameter records."""
    conn = get_connection()
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT * FROM cardiac_findings WHERE report_id = ?", (report_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
