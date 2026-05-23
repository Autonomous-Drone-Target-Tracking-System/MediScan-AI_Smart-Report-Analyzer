"""
audit.py — HIPAA-compliant persistent audit logging system.

Strictly records all clinical activities (PHI access, authentication, report generation, consent)
to the SQLite audit_logs table for compliance monitoring and security analytics.
"""

from __future__ import annotations

import logging
from typing import Optional
from db.database import get_connection

logger = logging.getLogger(__name__)


def log_audit(
    action: str,
    user_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    resource_id: Optional[str] = None,
    status: str = "SUCCESS",
    details: Optional[str] = None
):
    """
    Log a security or administrative action to the SQLite database.
    Guarantees exceptions are captured so audit failure doesn't crash the core API transaction.
    """
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO audit_logs (user_id, ip_address, action, resource_id, status, details)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                user_id,
                ip_address or "127.0.0.1",
                action,
                resource_id,
                status,
                details
            )
        )
        conn.commit()
        conn.close()
        logger.info(
            "[AuditLog] Action: %s | User: %s | Status: %s | Resource: %s",
            action, user_id, status, resource_id
        )
    except Exception as e:
        # Fallback to local logs if the audit database fails (critical HIPAA safeguard)
        logger.critical(
            "[CRITICAL AUDIT FAILURE] Database logging failed! Error: %s. "
            "Action: %s | User: %s | Status: %s | Resource: %s",
            e, action, user_id, status, resource_id
        )
