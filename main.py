"""
TikTok Food Discovery – FastAPI Backend
Phases 1–3: Extract → Enrich → MRT Mapping
"""

import os
import asyncio
from dotenv import load_dotenv
load_dotenv()
import httpx
from fastapi import FastAPI, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.extractor import extract_place_names
from services.enricher import enrich_place
from services.mrt_mapper import find_nearest_mrt
from services.ingester import is_tiktok_url, ingest_tiktok
from utils.deduplication import deduplicate_candidates

# ── 1. API KEY SAFETY CHECK ────────────────────────────────────────────────────
REQUIRED_KEYS = ["GEMINI_API_KEY", "GOOGLE_PLACES_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"]
missing_keys = [key for key in REQUIRED_KEYS if not os.getenv(key)]

if missing_keys:
    raise RuntimeError(f"Missing required environment variables: {', '.join(missing_keys)}")

SUPABASE_URL = os.environ["SUPABASE_URL"]

# ── 2. SUPABASE JWT AUTH ───────────────────────────────────────────────────────
_bearer = HTTPBearer()

async def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
) -> dict:
    """
    Validates the Supabase access token supplied in the Authorization header.
    Pings Supabase /auth/v1/user with the token — if Supabase accepts it,
    the request is allowed through; otherwise 401 is raised.
    """
    token = credentials.credentials
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": os.environ["SUPABASE_ANON_KEY"]
            },
        )
    if resp.status_code != 200:
        print(f"Supabase auth failed: {resp.status_code} - {resp.text}")
        raise HTTPException(status_code=401, detail="Invalid or expired session. Please log in again.")
    return resp.json()

app = FastAPI(title="TikTok Food Discovery API", version="1.0.0")

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,https://ttfoodies.vercel.app"        # default for local dev; override in production env
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
    place_id: str | None = None
    cuisine: str
    lat: float
    lng: float
    rating: float | None = None
    user_ratings_total: int | None = None
    price_level: int | None = None
    nearest_mrt: str
    verified: bool

class EnrichResponse(BaseModel):
    results: list[PlaceResult]

# ── Phase 1: Extraction ────────────────────────────────────────────────────────

@app.post("/extract", response_model=ExtractResponse)
async def extract(req: ExtractRequest, _user: dict = Depends(verify_token)):
    """
    Takes raw text (transcript / caption) and returns candidate names.
    """
    try:
        candidates = await extract_place_names(req.text)
        return ExtractResponse(candidates=candidates)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM Extraction failed: {str(e)}")

# ── Phase 2 & 3: Validation, Enrichment, and MRT Mapping ───────────────────────

@app.post("/enrich", response_model=EnrichResponse)
async def enrich(req: EnrichRequest, _user: dict = Depends(verify_token)):
    if not req.candidates:
        raise HTTPException(status_code=400, detail="Candidates list is empty.")

    # Deduplicate before hitting APIs
    unique_candidates = deduplicate_candidates(req.candidates)

    results: list[PlaceResult] = []

    # ── 2. PARALLEL PROCESSING ─────────────────────────────────────────────────
    # Pass transcript so enricher can use it for Tier 3 cuisine fallback
    tasks = [enrich_place(candidate, transcript=req.text) for candidate in unique_candidates]
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

        # Cuisine is now fully resolved inside enrich_place (Tier 1→2→3)
        nearest_mrt = find_nearest_mrt(place_data["lat"], place_data["lng"])

        results.append(PlaceResult(
            name=place_data["name"],
            address=place_data["address"],
            place_id=place_data.get("place_id"),
            cuisine=place_data["cuisine"],
            lat=place_data["lat"],
            lng=place_data["lng"],
            rating=place_data.get("rating"),
            user_ratings_total=place_data.get("user_ratings_total"),
            price_level=place_data.get("price_level"),
            nearest_mrt=nearest_mrt,
            verified=True,
        ))

    return EnrichResponse(results=results)

# ── Combined convenience endpoint ──────────────────────────────────────────────

@app.post("/generate", response_model=EnrichResponse)
async def generate(req: ExtractRequest, _user: dict = Depends(verify_token)):
    """
    Single-shot endpoint: raw text or TikTok URL → enriched + MRT-mapped results.
    Phase 4: if the input looks like a TikTok URL, ingest it first (caption + Vision).
    Powers the frontend in one round-trip for the MVP.
    """
    # ── Phase 4: TikTok URL ingestion ────────────────────────────────────
    if is_tiktok_url(req.text):
        try:
            text = await ingest_tiktok(req.text)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"TikTok ingestion failed: {str(e)}")
    else:
        text = req.text

    # ── Phase 1–3: extract → enrich → MRT map ───────────────────────────────
    extract_res = await extract(ExtractRequest(text=text))

    if not extract_res.candidates:
        return EnrichResponse(results=[])

    # Pass the original text down so the enricher can use it for the fallback
    enrich_req = EnrichRequest(candidates=extract_res.candidates, text=text)

    return await enrich(enrich_req)