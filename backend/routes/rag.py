"""
routes/rag.py — Upgraded, HIPAA-compliant Medical RAG API endpoints.

Enforces:
  1. require_hipaa_consent dependency for search/retrieval.
  2. RoleChecker dependency for writing/ingesting literature (only clinicians: doctors/admins).
  3. Records audit log events for all RAG guideline transactions.
"""

from __future__ import annotations

import logging
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Query, Depends, Request

from services.medical_rag import rag_store
from services.security_deps import require_hipaa_consent, RoleChecker
from services.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic Request Models ──

class IngestRequest(BaseModel):
    text: str = Field(..., description="Full text content of the guideline/literature", min_length=20)
    source: str = Field(..., description="Authorized publisher source: 'NIH', 'CDC', 'WHO', 'Mayo Clinic', 'PubMed', or other")
    url: str = Field(..., description="Official URL address link to the documentation source")
    citation: str = Field(..., description="Authoritative formal citation index")
    category: str = Field("Other", description="Clinical grouping category: e.g. 'Lipids', 'Blood Sugar', etc.")


# ── Router Endpoints ──

@router.get("/rag/search")
async def semantic_search(
    request: Request,
    query: str = Query(..., description="Natural language search term or clinical symptom"),
    top_k: int = Query(3, description="Maximum number of relative chunks to retrieve", ge=1, le=10),
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    Search the trusted medical knowledge base using Cosine Similarity.
    Restricted to authenticated patient/clinician profiles under HIPAA consent boundaries.
    """
    user_id = current_user["user_id"]
    ip = request.client.host if request.client else "127.0.0.1"

    if not query.strip():
        raise HTTPException(status_code=400, detail="Search query cannot be blank.")

    log_audit(
        action="RAG_GUIDELINE_SEARCH",
        user_id=user_id,
        ip_address=ip,
        status="SUCCESS",
        details=f"Performed semantic RAG literature search. Query: '{query}'"
    )

    matches = rag_store.search(query, top_k=top_k)
    results = []

    for chunk, score in matches:
        results.append({
            "chunk_id": chunk.chunk_id,
            "text": chunk.text,
            "source": chunk.source,
            "url": chunk.url,
            "citation": chunk.citation,
            "trust_score": chunk.trust_score,
            "relevance_score": score,
            "category": chunk.category,
        })

    return {
        "query": query,
        "results": results,
        "count": len(results)
    }


@router.post("/rag/ingest")
async def ingest_medical_guideline(
    payload: IngestRequest,
    request: Request,
    current_user: dict = Depends(RoleChecker(["doctor", "admin"]))
):
    """
    Ingest a new authoritative medical guideline.
    Granular RBAC: Only Clinicians (Doctors, Nurses, Admins) are authorized to ingest new clinical indices.
    """
    user_id = current_user["user_id"]
    ip = request.client.host if request.client else "127.0.0.1"

    try:
        rag_store.add_document(
            text=payload.text,
            source=payload.source,
            url=payload.url,
            citation=payload.citation,
            category=payload.category
        )

        log_audit(
            action="RAG_GUIDELINE_INGESTION",
            user_id=user_id,
            ip_address=ip,
            status="SUCCESS",
            details=f"Clinician ingested trusted guideline. Publisher: {payload.source}, Topic: {payload.category}"
        )

        return {
            "status": "success",
            "message": f"Successfully ingested guideline from {payload.source} into active RAG store."
        }
    except Exception as e:
        logger.error("[RAG API] Ingestion failed: %s", e)
        log_audit(
            action="RAG_GUIDELINE_INGESTION",
            user_id=user_id,
            ip_address=ip,
            status="FAILED",
            details=f"Failed to ingest clinical document: {str(e)}"
        )
        raise HTTPException(status_code=500, detail=f"Failed to ingest document: {str(e)}")


@router.get("/rag/knowledge-base")
async def get_entire_knowledge_base(
    request: Request,
    current_user: dict = Depends(require_hipaa_consent)
):
    """
    Retrieve all authoritative document chunks stored in the active RAG vector database.
    Requires authenticated session under HIPAA consent boundaries.
    """
    user_id = current_user["user_id"]
    ip = request.client.host if request.client else "127.0.0.1"

    log_audit(
        action="RAG_KNOWLEDGE_BASE_VIEW",
        user_id=user_id,
        ip_address=ip,
        status="SUCCESS",
        details="Viewed entire available guideline chunks."
    )

    return {
        "chunks": [c.to_dict() for c in rag_store.chunks],
        "count": len(rag_store.chunks)
    }
