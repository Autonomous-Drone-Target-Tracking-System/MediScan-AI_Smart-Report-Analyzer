"""
FastAPI application entry point.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from db.init_db import init_db
from routes.upload import router as upload_router
from routes.analyze import router as analyze_router
from routes.chat import router as chat_router
from routes.analytics import router as analytics_router
from routes.rag import router as rag_router
from routes.auth import router as auth_router
from routes.radiology import router as radiology_router
from routes.cardiac import router as cardiac_router
from routes.dicom import router as dicom_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Smart Medical Report Analyzer",
    description="AI-powered medical report analysis API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    os.getenv("FRONTEND_URL", ""),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files (uploads) ────────────────────────────────────────────────────
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(upload_router, prefix="/api", tags=["Upload"])
app.include_router(analyze_router, prefix="/api", tags=["Analysis"])
app.include_router(chat_router,      prefix="/api", tags=["Chat"])
app.include_router(analytics_router, prefix="/api", tags=["Analytics"])
app.include_router(rag_router,       prefix="/api", tags=["RAG"])
app.include_router(auth_router,      prefix="/api", tags=["Auth"])
app.include_router(radiology_router, prefix="/api", tags=["Radiology"])
app.include_router(cardiac_router,   prefix="/api", tags=["Cardiac"])
app.include_router(dicom_router,     prefix="/api", tags=["DICOM"])


@app.get("/")
def root():
    return {
        "message": "Smart Medical Report Analyzer API",
        "docs": "/docs",
        "status": "running",
    }
