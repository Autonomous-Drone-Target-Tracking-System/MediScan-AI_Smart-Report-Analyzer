"""
security_deps.py — Security dependencies, RBAC verification & Rate Limiting.

Enforces HIPAA directives at the API gateway layer.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Dict, List, Optional
from fastapi import Header, HTTPException, Depends, Request
import jwt

from db.database import get_connection
from services.hipaa_manager import purge_expired_guests

logger = logging.getLogger(__name__)

JWT_SECRET = os.getenv("JWT_SECRET_KEY", "mediscan-super-secret-key-for-jwt-signing-2026")
ALGORITHM = "HS256"

# In-memory sliding-window rate limit store
# Format: {ip_address: [timestamp1, timestamp2]}
RATE_LIMIT_STORE: Dict[str, List[float]] = {}
LIMIT_WINDOW = 60  # seconds
LIMIT_REQUESTS = 60  # max requests per window


# ── Rate Limiter ──

def enforce_rate_limiting(request: Request):
    """Enforces API rate limits per IP to protect medical servers from brute-force & DDoS."""
    ip = request.client.host if request.client else "127.0.0.1"
    now = time.time()

    # Clear outdated timestamps
    if ip in RATE_LIMIT_STORE:
        RATE_LIMIT_STORE[ip] = [t for t in RATE_LIMIT_STORE[ip] if now - t < LIMIT_WINDOW]
    else:
        RATE_LIMIT_STORE[ip] = []

    # Check limit
    if len(RATE_LIMIT_STORE[ip]) >= LIMIT_REQUESTS:
        logger.warning("[Rate Limiter] Rate limit exceeded by IP: %s", ip)
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please wait a minute before submitting again."
        )

    # Log current hit
    RATE_LIMIT_STORE[ip].append(now)


# ── Authentication & Consent Dependencies ──

async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict:
    """
    Decodes the user's JWT access token, checks database credentials, and
    periodically runs guest session auto-deletes.
    """
    # Periodically run guest shredder on incoming secure calls (efficient lifecycle management)
    try:
        purge_expired_guests()
    except Exception as e:
        logger.error("[Security Deps] Guest purger trigger failed: %s", e)

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or malformed Authorization header. Use Bearer token."
        )

    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Access token has expired.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid access token credentials.")

    try:
        conn = get_connection()
        cur = conn.cursor()
        user = cur.execute(
            "SELECT user_id, email, role, consent_given, is_guest, expires_at FROM users WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        conn.close()

        if not user:
            raise HTTPException(status_code=401, detail="User account no longer exists.")

        # Check if guest session has expired
        if user["is_guest"] and user["expires_at"]:
            expiry = datetime_from_iso(user["expires_at"])
            if expiry and expiry < time.time():
                raise HTTPException(status_code=401, detail="Anonymous guest session has expired.")

        return dict(user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[Security Deps] User validation failed: %s", e)
        raise HTTPException(status_code=500, detail="Authentication server error.")


def require_hipaa_consent(user: Dict = Depends(get_current_user)):
    """Enforces that the authenticated user has explicitly signed electronic data consent."""
    if not user.get("consent_given"):
        raise HTTPException(
            status_code=403,
            detail=(
                "HIPAA Compliance Directive: You must electronically sign the HIPAA Data "
                "Consent agreement before medical reports can be parsed or stored."
            )
        )
    return user


# ── RBAC Role Enforcement ──

class RoleChecker:
    """Dependency validator that strictly limits access based on user account roles."""
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: Dict = Depends(get_current_user)):
        role = user.get("role")
        if role not in self.allowed_roles:
            logger.warning("[RBAC Violation] User %s (role: %s) attempted to access unauthorized resource.", user.get("user_id"), role)
            raise HTTPException(
                status_code=403,
                detail=f"RBAC Enforcement: Required role: {self.allowed_roles}. Current role: {role} is unauthorized."
            )
        return user


# ── Helper ──

def datetime_from_iso(iso_str: str) -> Optional[float]:
    """Helper to convert ISO string to timestamp."""
    try:
        # Standard formatting: 2026-05-23T11:00:00
        dt = time.strptime(iso_str.split(".")[0], "%Y-%m-%dT%H:%M:%S")
        return time.mktime(dt)
    except Exception:
        return None
