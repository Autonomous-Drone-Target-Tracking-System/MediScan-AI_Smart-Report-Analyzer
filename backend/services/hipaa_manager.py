"""
hipaa_manager.py — HIPAA Compliance, Data Consent & Guest Auto-Delete Engine.

Ensures:
  1. Electronic Consent Management before storing PHI.
  2. Automatic Shredding of temporary guest data after expiration (default: 24h).
  3. Physical deletion of encrypted reports from disk.
"""

from __future__ import annotations

import os
import logging
from datetime import datetime
from db.database import get_connection
from services.audit import log_audit

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")


def update_patient_consent(user_id: int, consent_given: bool) -> bool:
    """Updates user consent status and timestamp in the database."""
    try:
        conn = get_connection()
        cur = conn.cursor()
        now_str = datetime.utcnow().isoformat() if consent_given else None
        cur.execute(
            "UPDATE users SET consent_given = ?, consent_timestamp = ? WHERE user_id = ?",
            (1 if consent_given else 0, now_str, user_id)
        )
        conn.commit()
        conn.close()
        
        log_audit(
            action="CONSENT_UPDATE",
            user_id=user_id,
            status="SUCCESS",
            details=f"Consent set to {consent_given} at {now_str}"
        )
        return True
    except Exception as e:
        logger.error("[HIPAA Manager] Consent update failed for user %d: %s", user_id, e)
        return False


def purge_expired_guests() -> int:
    """
    Finds and completely shreds all expired temporary guest user accounts,
    including deleting physical PDF/image files and clearing all database traces.
    Returns the count of purged accounts.
    """
    try:
        conn = get_connection()
        # Enable foreign keys for cascading deletes
        conn.execute("PRAGMA foreign_keys = ON;")
        cur = conn.cursor()

        # Find expired guests
        now_str = datetime.utcnow().isoformat()
        expired_users = cur.execute(
            "SELECT user_id, email FROM users WHERE is_guest = 1 AND expires_at < ?",
            (now_str,)
        ).fetchall()

        if not expired_users:
            conn.close()
            return 0

        purged_count = 0
        for user_id, email in expired_users:
            # 1. Fetch physical files to delete
            reports = cur.execute(
                "SELECT report_id, document_url FROM reports WHERE user_id = ?",
                (user_id,)
            ).fetchall()

            deleted_files = 0
            for report_id, doc_url in reports:
                # Resolve local file path
                if doc_url.startswith("/uploads/"):
                    filename = doc_url.split("/")[-1]
                    file_path = os.path.join(UPLOAD_DIR, filename)
                    if os.path.exists(file_path):
                        try:
                            os.remove(file_path)
                            deleted_files += 1
                        except Exception as e:
                            logger.error("[HIPAA Purger] Failed to delete file %s: %s", file_path, e)

            # 2. Delete user (cascades to reports and biomarkers due to FOREIGN KEY constraints)
            cur.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
            purged_count += 1

            # 3. Log HIPAA Audit shredding
            log_audit(
                action="AUTO_DELETE_TRIGGERED",
                user_id=user_id,
                status="SUCCESS",
                details=(
                    f"Temporary guest user '{email}' auto-deleted. "
                    f"Shredded {len(reports)} database report entries and deleted {deleted_files} files."
                )
            )

        conn.commit()
        conn.close()
        logger.info("[HIPAA Purger] Successfully shredded %d expired guest profiles", purged_count)
        return purged_count

    except Exception as e:
        logger.critical("[HIPAA Purger] Auto-delete purging failed critically: %s", e)
        return 0
