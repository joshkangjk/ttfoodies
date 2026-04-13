"""
TikTok Food Discovery – FastAPI Backend
Phases 1–3: Extract → Enrich → MRT Mapping
"""

import os
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.extractor import extract_place_names
from services.enricher import enrich_place, infer_cuisine_from_text # Added infer helper
from services.mrt_mapper import find_nearest_mrt
from utils.deduplication import deduplicate_candidates

# ── 1. API KEY SAFETY CHECK ────────────────────────────────────────────────────
REQUIRED_KEYS = ["OPENAI_API_KEY", "GOOGLE_PLACES_API_KEY"]
missing_keys = [key for key in REQUIRED_KEYS if not os.getenv(key)]

if missing_keys:
    raise RuntimeError(f"Missing required environment variables: {', '.join(missing_keys)}")

app = FastAPI(title="TikTok Food Discovery API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],   # update for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request / Response models ──────────────────────────────────────────────────

class ExtractRequest(BaseModel):
    text: str                        # raw transcript or caption

class ExtractResponse(BaseModel):
    candidates: list[str]            # raw place name strings

class EnrichRequest(BaseModel):
    candidates: list[str]
    text: str = ""                   # ADDED: Need original text for cuisine fallback

class PlaceResult(BaseModel):
    name: str
    address: str
    cuisine: str
    lat: float
    lng: float
    nearest_mrt: str
    verified: bool

class EnrichResponse(BaseModel):
    results: list[PlaceResult]

# ── Phase 1: Extraction ────────────────────────────────────────────────────────

@app.post("/extract", response_model=ExtractResponse)
async def extract(req: ExtractRequest):
    """
    Takes raw text (transcript / caption) and returns candidate names.
    """
    candidates = await extract_place_names(req.text)
    return ExtractResponse(candidates=candidates)

# ── Phase 2 & 3: Validation, Enrichment, and MRT Mapping ───────────────────────

@app.post("/enrich", response_model=EnrichResponse)
async def enrich(req: EnrichRequest):
    if not req.candidates:
        raise HTTPException(status_code=400, detail="Candidates list is empty.")

    # Deduplicate before hitting APIs
    unique_candidates = deduplicate_candidates(req.candidates)

    results: list[PlaceResult] = []

    # ── 2. PARALLEL PROCESSING ─────────────────────────────────────────────────
    # Create tasks for all Google API calls to run simultaneously
    tasks = [enrich_place(candidate) for candidate in unique_candidates]
    enriched_data_list = await asyncio.gather(*tasks)

    for candidate, place_data in zip(unique_candidates, enriched_data_list):
        if place_data is None:
            # Validation failed – surface as Unverified placeholder
            results.append(PlaceResult(
                name=candidate,
                address="",
                cuisine="Unknown",
                lat=0.0,
                lng=0.0,
                nearest_mrt="Unknown",
                verified=False,
            ))
            continue

        # ── 3. CUISINE FALLBACK LOGIC ──────────────────────────────────────────
        cuisine = place_data["cuisine"]
        if cuisine in ["Establishment", "Food", "Point of Interest", "Other"] and req.text:
            cuisine = await infer_cuisine_from_text(place_data["name"], req.text)

        nearest_mrt = find_nearest_mrt(place_data["lat"], place_data["lng"])

        results.append(PlaceResult(
            name=place_data["name"],
            address=place_data["address"],
            cuisine=cuisine,
            lat=place_data["lat"],
            lng=place_data["lng"],
            nearest_mrt=nearest_mrt,
            verified=True,
        ))

    return EnrichResponse(results=results)

# ── Combined convenience endpoint ──────────────────────────────────────────────

@app.post("/generate", response_model=EnrichResponse)
async def generate(req: ExtractRequest):
    """
    Single-shot endpoint: raw text → enriched + MRT-mapped results.
    Powers the frontend in one round-trip for the MVP.
    """
    extract_res = await extract(req)
    
    # Pass the original text down so the enricher can use it for the fallback
    enrich_req = EnrichRequest(candidates=extract_res.candidates, text=req.text)
    
    return await enrich(enrich_req)