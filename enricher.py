"""
services/enricher.py
Phase 2 – Validate and enrich a candidate name via Google Places API.
"""

import os
import httpx
from typing import Optional
from openai import AsyncOpenAI

GOOGLE_API_KEY = os.environ["GOOGLE_PLACES_API_KEY"]

# Cuisine category mapping: Google type → standardised label
CUISINE_MAP: dict[str, str] = {
    "japanese_restaurant":  "Japanese",
    "korean_restaurant":    "Korean",
    "chinese_restaurant":   "Chinese",
    "american_restaurant":  "Western",
    "italian_restaurant":   "Western",
    "french_restaurant":    "Western",
    "cafe":                 "Cafe / Dessert",
    "coffee_shop":          "Cafe / Dessert",
    "dessert_shop":         "Cafe / Dessert",
    "hawker_centre":        "Local Hawker",
    "food_court":           "Local Hawker",
    "meal_takeaway":        "Local Hawker",
}

DEFAULT_CUISINE = "Other"

# Singapore bounding box used as location bias
SINGAPORE_LAT = 1.3521
SINGAPORE_LNG = 103.8198


def _map_cuisine(types: list[str]) -> str:
    """
    Map Google Places `types` array to a standardised cuisine label.
    Iterates in order; returns the first match or DEFAULT_CUISINE.
    """
    for t in types:
        if t in CUISINE_MAP:
            return CUISINE_MAP[t]
    return DEFAULT_CUISINE


async def enrich_place(candidate: str) -> Optional[dict]:
    """
    Query the Google Places API (Text Search) for a Singapore restaurant.

    Args:
        candidate: Raw place name string.

    Returns:
        Dict with keys {name, address, cuisine, lat, lng} or None if
        no valid result is found.
    """
    query = f"{candidate} Singapore food"

    params = {
        "query":    query,
        "key":      GOOGLE_API_KEY,
        "language": "en",
        # Bias results to Singapore with a tight radius
        "location": f"{SINGAPORE_LAT},{SINGAPORE_LNG}",
        "radius":   25000,      # 25 km covers all of Singapore
    }

    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(
            "https://maps.googleapis.com/maps/api/place/textsearch/json",
            params=params,
        )
        data = resp.json()

    if data.get("status") != "OK":
        return None

    results = data.get("results", [])
    if not results:
        return None

    # Take the top result
    place = results[0]

    name    = place.get("name", candidate)
    address = place.get("formatted_address", "")
    types   = place.get("types", [])
    cuisine = _map_cuisine(types)
    lat     = place["geometry"]["location"]["lat"]
    lng     = place["geometry"]["location"]["lng"]

    return {
        "name":    name,
        "address": address,
        "cuisine": cuisine,
        "lat":     lat,
        "lng":     lng,
    }

async def infer_cuisine_from_text(place_name: str, transcript: str) -> str:
    """
    Fallback logic to determine cuisine from transcript if Google API is generic.
    """
    prompt = f"""
    Based on this TikTok transcript: "{transcript}"
    What is the cuisine of the place "{place_name}"?
    Categories: Japanese, Korean, Western, Local Hawker, Cafe / Dessert, or Other.
    Return ONLY the category name. If you cannot tell, return "Other".
    """
    
    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini", # Using mini here saves cost and is fast enough for classification
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
        category = response.choices[0].message.content.strip()
        
        # Ensure it strictly matches one of your frontend colors
        valid_categories = ["Japanese", "Korean", "Western", "Local Hawker", "Cafe / Dessert", "Chinese"]
        if category in valid_categories:
            return category
        return "Other"
    except Exception:
        return "Other"