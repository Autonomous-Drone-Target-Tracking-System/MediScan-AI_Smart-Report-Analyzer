"""
routes/auth.py — Authentication, Authorization & User Registration routes for HIPAA Security.
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Header, Response, Cookie
from pydantic import BaseModel, EmailStr, Field
import jwt
from passlib.hash import bcrypt

from db.database import get_connection
from services.audit import log_audit
from services.hipaa_manager import update_patient_consent

logger = logging.getLogger(__name__)
router = APIRouter()

# ── JWT Configs ──
JWT_SECRET = os.getenv("JWT_SECRET_KEY", "mediscan-super-secret-key-for-jwt-signing-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7


# ── Pydantic Schemas ──

class UserRegister(BaseModel):
    email: EmailStr = Field(..., description="Unique email address for registration")
    password: str = Field(..., description="Strong user password", min_length=8)
    role: str = Field("patient", description="Assigned authorization role: 'patient' or 'doctor'")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ConsentRequest(BaseModel):
    consent_given: bool


# ── JWT Utility Helper Functions ──

def create_access_token(user_id: int, role: str, email: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "role": role,
        "email": email,
        "exp": expire
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def create_refresh_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "exp": expire
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)
    
    # Save refresh token in DB
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("UPDATE users SET refresh_token = ? WHERE user_id = ?", (token, user_id))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error("[Auth Utilities] Failed to persist refresh token: %s", e)
        
    return token


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/auth/register")
async def register_user(payload: UserRegister):
    """Signs up a new clinical account and logs the trace to security audits."""
    # Ensure role is safe
    role = payload.role if payload.role in ("patient", "doctor") else "patient"
    password_hash = bcrypt.hash(payload.password)

    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # Check if user already exists
        exists = cur.execute("SELECT user_id FROM users WHERE email = ?", (payload.email,)).fetchone()
        if exists:
            conn.close()
            log_audit(action="REGISTER_FAILED", status="FAILED", details=f"Email '{payload.email}' already exists.")
            raise HTTPException(status_code=400, detail="Account with this email already exists.")

        # Create record
        cur.execute(
            "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
            (payload.email, password_hash, role)
        )
        user_id = cur.lastrowid
        conn.commit()
        conn.close()

        log_audit(
            action="ACCOUNT_CREATED",
            user_id=user_id,
            status="SUCCESS",
            details=f"User signed up as {role} under email '{payload.email}'"
        )
        return {
            "status": "success",
            "message": "Clinical account created successfully. Please login.",
            "user_id": user_id
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[Auth Route] Registration error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to register user.")


@router.post("/auth/login")
async def login_user(payload: UserLogin, response: Response):
    """Verifies clinical account credentials, returns a JWT, and stores an HTTP-only refresh token."""
    try:
        conn = get_connection()
        cur = conn.cursor()
        user = cur.execute(
            "SELECT user_id, email, password_hash, role, consent_given FROM users WHERE email = ?",
            (payload.email,)
        ).fetchone()
        conn.close()

        if not user or not user["password_hash"] or not bcrypt.verify(payload.password, user["password_hash"]):
            log_audit(action="LOGIN_FAILED", status="UNAUTHORIZED", details=f"Failed login attempt for email '{payload.email}'")
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        user_id = user["user_id"]
        role = user["role"]
        email = user["email"]

        # Generate tokens
        access_token = create_access_token(user_id, role, email)
        refresh_token = create_refresh_token(user_id)

        # Set refresh token as secure HTTP-only cookie
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=True,     # HTTPS in production
            samesite="lax",
            max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
        )

        log_audit(
            action="LOGIN_SUCCESS",
            user_id=user_id,
            status="SUCCESS",
            details=f"User '{email}' successfully authenticated with role '{role}'"
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": role,
            "consent_given": bool(user["consent_given"])
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[Auth Route] Login error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to log in.")


@router.post("/auth/guest")
async def create_guest_user(response: Response):
    """
    Sets up a temporary anonymous patient guest profile valid for 24 hours.
    Allows quick compliance-bound testing under standard automated shredding policies.
    """
    guest_uuid = os.urandom(8).hex()
    email = f"guest_{guest_uuid}@mediscan.local"
    # Guest role is strictly limited to patient
    role = "patient"
    expires_at = (datetime.utcnow() + timedelta(hours=24)).isoformat()

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (email, role, is_guest, expires_at) VALUES (?, ?, 1, ?)",
            (email, role, expires_at)
        )
        user_id = cur.lastrowid
        conn.commit()
        conn.close()

        access_token = create_access_token(user_id, role, email)
        refresh_token = create_refresh_token(user_id)

        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=24 * 3600
        )

        log_audit(
            action="GUEST_CREATED",
            user_id=user_id,
            status="SUCCESS",
            details=f"Anonymous guest profile active until {expires_at}"
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": role,
            "is_guest": True,
            "expires_at": expires_at,
            "consent_given": False
        }
    except Exception as e:
        logger.error("[Auth Route] Guest account creation error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create guest session.")


@router.post("/auth/refresh")
async def refresh_access_token(response: Response, refresh_token: Optional[str] = Cookie(None)):
    """Signs a fresh access token if the secure refresh cookie is authenticated."""
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token not found.")

    try:
        payload = jwt.decode(refresh_token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")

    try:
        conn = get_connection()
        cur = conn.cursor()
        user = cur.execute(
            "SELECT user_id, email, role, refresh_token FROM users WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        conn.close()

        if not user or user["refresh_token"] != refresh_token:
            raise HTTPException(status_code=401, detail="Revoked refresh token.")

        # Generate new access token
        access_token = create_access_token(user["user_id"], user["role"], user["email"])
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": user["role"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[Auth Route] Token refresh error: %s", e)
        raise HTTPException(status_code=500, detail="Token refresh failed.")


@router.post("/auth/consent")
async def submit_hipaa_consent(payload: ConsentRequest, authorization: str = Header(...)):
    """Logs patient legal electronic agreements to process and evaluate PHI."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header.")

    token = authorization.split(" ")[1]
    try:
        jwt_payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id = int(jwt_payload["sub"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token.")

    success = update_patient_consent(user_id, payload.consent_given)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to record consent.")

    return {
        "status": "success",
        "consent_given": payload.consent_given,
        "message": "HIPAA consent choice successfully registered."
    }


@router.get("/auth/me")
async def get_current_user_profile(authorization: str = Header(...)):
    """Retrieves standard identification and demographics of the validated active token user."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token.")

    token = authorization.split(" ")[1]
    try:
        jwt_payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id = int(jwt_payload["sub"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token.")

    try:
        conn = get_connection()
        cur = conn.cursor()
        user = cur.execute(
            "SELECT user_id, email, role, consent_given, consent_timestamp, is_guest, expires_at FROM users WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        conn.close()

        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        return {
            "user_id": user["user_id"],
            "email": user["email"],
            "role": user["role"],
            "consent_given": bool(user["consent_given"]),
            "consent_timestamp": user["consent_timestamp"],
            "is_guest": bool(user["is_guest"]),
            "expires_at": user["expires_at"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[Auth Route] Profile retrieval failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load user profile.")
