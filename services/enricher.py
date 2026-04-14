"""
services/enricher.py
Phase 2 – Validate and enrich a candidate name via Google Places API.
"""

import os
import httpx
from typing import Optional
from google import genai

GOOGLE_API_KEY = os.environ["GOOGLE_PLACES_API_KEY"]
gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
GEMINI_MODEL = "gemini-2.5-flash"

# Cuisine category mapping: Google type → standardised label
#
# Ordered from most-specific to most-generic within each group so that the
# first-match logic in _map_cuisine() resolves to the tightest label.
#
# Sources: Google Places API (legacy Text Search) + Places API v1 type list.
# Refresh periodically as Google adds new place types.
CUISINE_MAP: dict[str, str] = {

    # ── Japanese ────────────────────────────────────────────────────────────
    "japanese_restaurant":          "Japanese",
    "sushi_restaurant":             "Japanese",
    "ramen_restaurant":             "Japanese",
    "ramen_noodle_shop":            "Japanese",   # alt label seen in v1
    "yakitori_restaurant":          "Japanese",
    "teppanyaki_restaurant":        "Japanese",
    "tonkatsu_restaurant":          "Japanese",
    "tempura_restaurant":           "Japanese",
    "udon_noodle_restaurant":       "Japanese",
    "udon_and_soba_restaurant":     "Japanese",
    "yakiniku_restaurant":          "Japanese",
    "izakaya":                      "Japanese",

    # ── Korean ──────────────────────────────────────────────────────────────
    "korean_restaurant":            "Korean",
    "korean_barbecue_restaurant":   "Korean",

    # ── Chinese ─────────────────────────────────────────────────────────────
    "chinese_restaurant":           "Chinese",
    "dim_sum_restaurant":           "Chinese",
    "cantonese_restaurant":         "Chinese",
    "wonton_restaurant":            "Chinese",
    "hot_pot_restaurant":           "Chinese",
    "hotpot_restaurant":            "Chinese",   # alt spelling
    "szechuan_restaurant":          "Chinese",
    "sichuan_restaurant":           "Chinese",   # alt spelling
    "taiwanese_restaurant":         "Chinese",
    "congee_restaurant":            "Chinese",
    "roast_meat_restaurant":        "Chinese",
    "bak_kut_teh_restaurant":       "Chinese",
    "seafood_restaurant":           "Chinese",   # Cantonese-style seafood dominates in SG

    # ── Western ─────────────────────────────────────────────────────────────
    "american_restaurant":          "Western",
    "italian_restaurant":           "Western",
    "french_restaurant":            "Western",
    "steak_house":                  "Western",
    "steakhouse":                   "Western",   # alt spelling
    "hamburger_restaurant":         "Western",
    "burger_restaurant":            "Western",
    "pizza_restaurant":             "Western",
    "pizzeria":                     "Western",
    "mexican_restaurant":           "Western",
    "tex_mex_restaurant":           "Western",
    "greek_restaurant":             "Western",
    "mediterranean_restaurant":     "Western",
    "spanish_restaurant":           "Western",
    "tapas_bar":                    "Western",
    "portuguese_restaurant":        "Western",
    "brazilian_restaurant":         "Western",
    "barbecue_restaurant":          "Western",
    "brunch_restaurant":            "Western",
    "breakfast_restaurant":         "Western",
    "sandwich_shop":                "Western",
    "sandwiches_restaurant":        "Western",
    "deli":                         "Western",
    "pub":                          "Western",
    "gastropub":                    "Western",
    "british_restaurant":           "Western",
    "german_restaurant":            "Western",
    "austrian_restaurant":          "Western",
    "swiss_restaurant":             "Western",
    "russian_restaurant":           "Western",

    # ── Cafe / Dessert ───────────────────────────────────────────────────────
    "cafe":                         "Cafe / Dessert",
    "coffee_shop":                  "Cafe / Dessert",
    "dessert_shop":                 "Cafe / Dessert",
    "dessert_restaurant":           "Cafe / Dessert",
    "bakery":                       "Cafe / Dessert",
    "patisserie":                   "Cafe / Dessert",
    "ice_cream_shop":               "Cafe / Dessert",
    "donut_shop":                   "Cafe / Dessert",
    "juice_bar":                    "Cafe / Dessert",
    "smoothie_bar":                 "Cafe / Dessert",
    "tea_house":                    "Cafe / Dessert",   # bubble tea / afternoon tea
    "bubble_tea_shop":              "Cafe / Dessert",
    "boba_tea_restaurant":          "Cafe / Dessert",
    "acai_shop":                    "Cafe / Dessert",
    "waffle_shop":                  "Cafe / Dessert",
    "crepe_restaurant":             "Cafe / Dessert",
    "chocolate_shop":               "Cafe / Dessert",
    "confectionery":                "Cafe / Dessert",

    # ── Local Hawker (Singapore-centric) ─────────────────────────────────────
    "hawker_centre":                "Local Hawker",
    "food_court":                   "Local Hawker",
    "meal_takeaway":                "Local Hawker",
    "singaporean_restaurant":       "Local Hawker",
    "malaysian_restaurant":         "Local Hawker",
    "indonesian_restaurant":        "Local Hawker",   # nasi padang, etc.
    "nasi_padang_restaurant":       "Local Hawker",
    "kopitiam":                     "Local Hawker",
    "chicken_rice_restaurant":      "Local Hawker",
    "laksa_restaurant":             "Local Hawker",
    "satay_restaurant":             "Local Hawker",

    # ── Other (explicitly mapped so AI fallback is rarely needed) ────────────
    "indian_restaurant":            "Other",
    "south_indian_restaurant":      "Other",
    "north_indian_restaurant":      "Other",
    "pakistani_restaurant":         "Other",
    "bangladeshi_restaurant":       "Other",
    "thai_restaurant":              "Other",
    "vietnamese_restaurant":        "Other",
    "pho_restaurant":               "Other",
    "filipino_restaurant":          "Other",
    "burmese_restaurant":           "Other",
    "cambodian_restaurant":         "Other",
    "laotian_restaurant":           "Other",
    "middle_eastern_restaurant":    "Other",
    "lebanese_restaurant":          "Other",
    "turkish_restaurant":           "Other",
    "arabic_restaurant":            "Other",
    "persian_restaurant":           "Other",
    "afghani_restaurant":           "Other",
    "african_restaurant":           "Other",
    "ethiopian_restaurant":         "Other",
    "hawaiian_restaurant":          "Other",
    "poke_restaurant":              "Other",
    "vegetarian_restaurant":        "Other",
    "vegan_restaurant":             "Other",
    "health_food_restaurant":       "Other",
    "organic_restaurant":           "Other",
    "fusion_restaurant":            "Other",
    "international_restaurant":     "Other",
    "buffet_restaurant":            "Other",
    "fast_food_restaurant":         "Other",
    "food_stand":                   "Other",
    "bar":                          "Other",
    "night_club":                   "Other",
}

DEFAULT_CUISINE = "Other"

# Singapore bounding box used as location bias
SINGAPORE_LAT = 1.3521
SINGAPORE_LNG = 103.8198


VALID_CATEGORIES = ["Japanese", "Korean", "Western", "Local Hawker", "Cafe / Dessert", "Chinese"]


def _map_cuisine(types: list[str]) -> str:
    """
    Tier 1: Map Google Places `types` array to a standardised cuisine label.
    Iterates in order; returns the first match or DEFAULT_CUISINE.
    """
    for t in types:
        if t in CUISINE_MAP:
            return CUISINE_MAP[t]
    return DEFAULT_CUISINE


async def _fetch_place_details(place_id: str) -> dict:
    """
    Call the Places Details API to fetch rich context for cuisine inference.

    Requests only the fields used for classification to minimise billing cost
    (editorial_summary + reviews are Basic Data; website is Contact Data).

    Args:
        place_id: Google Places place_id string.

    Returns:
        Dict with keys {editorial_summary, reviews, website}, each an empty
        string / list if unavailable. Returns an empty dict on any error.
    """
    params = {
        "place_id": place_id,
        "key":      GOOGLE_API_KEY,
        "language": "en",
        "fields":   "editorial_summary,reviews,website,name",
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://maps.googleapis.com/maps/api/place/details/json",
                params=params,
            )
            data = resp.json()

        if data.get("status") != "OK":
            return {}

        result = data.get("result", {})
        return {
            "editorial_summary": result.get("editorial_summary", {}).get("overview", ""),
            # Keep only the 5 most-helpful reviews to stay within prompt token budget
            "reviews": [
                r.get("text", "") for r in result.get("reviews", [])[:5]
            ],
            "website": result.get("website", ""),
        }
    except Exception:
        return {}


async def infer_cuisine_from_name(
    place_name: str,
    address: str,
    details: Optional[dict] = None,
) -> str:
    """
    Tier 2: Use Gemini's world knowledge to classify cuisine from the place
    name, address, and any Place Details context available.

    Called only when _map_cuisine() returns DEFAULT_CUISINE, so it never runs
    for places already resolved by the type-map.

    Args:
        place_name: Resolved place name from Google Places.
        address:    Formatted address from Google Places.
        details:    Optional dict from _fetch_place_details() with keys
                    {editorial_summary, reviews, website}.

    Returns:
        A valid category string, or "Other" if Gemini is uncertain.
    """
    # Build optional context block from Place Details
    context_lines: list[str] = []

    if details:
        if details.get("editorial_summary"):
            context_lines.append(f'Editorial summary : {details["editorial_summary"]}')
        if details.get("website"):
            context_lines.append(f'Website           : {details["website"]}')
        if details.get("reviews"):
            joined = " | ".join(details["reviews"])
            context_lines.append(f'Customer reviews  : {joined}')

    context_block = (
        "\n\nAdditional context from Google:\n" + "\n".join(context_lines)
        if context_lines else ""
    )

    prompt = f"""You are classifying a Singapore food establishment by cuisine type.

Place name : {place_name}
Address    : {address}{context_block}

Using the name, address, and any context above, choose ONE category:
  Japanese | Korean | Chinese | Western | Local Hawker | Cafe / Dessert | Other

Guidelines:
- "Local Hawker" = Singaporean / Malaysian / Indonesian street food and kopitiams.
- "Other" covers Vietnamese, Thai, Indian, Filipino, Middle Eastern, and anything that
  does not clearly fit the above six.
- Brand names are strong signals (e.g. "So Pho" → Other/Vietnamese, "Haidilao" → Chinese,
  "Nando's" → Western, "Old Chang Kee" → Local Hawker).
- If genuinely ambiguous, return "Other".

Return ONLY the category name — no explanation, no punctuation."""

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[prompt],
            config={"temperature": 0},
        )
        category = response.text.strip()
        return category if category in VALID_CATEGORIES else DEFAULT_CUISINE
    except Exception:
        return DEFAULT_CUISINE


async def enrich_place(candidate: str, transcript: str = "") -> Optional[dict]:
    """
    Query the Google Places API (Text Search) for a Singapore restaurant,
    then resolve its cuisine through a three-tier fallback chain:

        Tier 1 – CUISINE_MAP type lookup  (free, instant)
        Tier 2 – Gemini + Place Details   (one extra API call + one LLM call)
        Tier 3 – Gemini + TikTok transcript (LLM call, only if transcript given)

    Args:
        candidate:  Raw place name string.
        transcript: Optional TikTok transcript for Tier 3 fallback.

    Returns:
        Dict with keys {name, address, place_id, cuisine, lat, lng,
        rating, user_ratings_total, price_level, cuisine_source} or None.
    """
    # ── Text Search ──────────────────────────────────────────────────────────
    # We do NOT append "Singapore food" to the query because it triggers aggressive
    # autocorrecting on Google's end for unique place names (e.g. "aifokato" → "Affogato").
    # The location/radius parameters below already restrict results to Singapore.
    params = {
        "query":    candidate,
        "key":      GOOGLE_API_KEY,
        "language": "en",
        "location": f"{SINGAPORE_LAT},{SINGAPORE_LNG}",
        "radius":   25000,          # 25 km covers all of Singapore
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

    FOOD_TYPES = {
        "restaurant", "food", "meal_delivery", "meal_takeaway",
        "bakery", "cafe", "bar", "night_club", "hawker_centre",
    }

    food_results = [p for p in results if any(t in FOOD_TYPES for t in p.get("types", []))]
    if not food_results:
        return None

    # Prefer results where the candidate string appears verbatim in the name
    # to guard against Google autocorrect (e.g. "aifokato" → "Caffe Affogato").
    candidate_lower = candidate.lower()
    valid_place = next(
        (p for p in food_results if candidate_lower in p.get("name", "").lower()),
        food_results[0],   # fallback to Google's top-ranked food result
    )

    name     = valid_place.get("name", candidate)
    address  = valid_place.get("formatted_address", "")
    place_id = valid_place.get("place_id", "")
    types    = valid_place.get("types", [])
    lat      = valid_place["geometry"]["location"]["lat"]
    lng      = valid_place["geometry"]["location"]["lng"]
    rating              = valid_place.get("rating")
    user_ratings_total  = valid_place.get("user_ratings_total")
    price_level         = valid_place.get("price_level")

    # ── Tier 1: type-map lookup ──────────────────────────────────────────────
    cuisine = _map_cuisine(types)
    cuisine_source = "type_map"

    # ── Tier 2: Place Details + Gemini name/context inference ────────────────
    if cuisine == DEFAULT_CUISINE:
        details = await _fetch_place_details(place_id) if place_id else {}
        cuisine = await infer_cuisine_from_name(name, address, details)
        cuisine_source = "gemini_name"

    # ── Tier 3: Gemini transcript inference ──────────────────────────────────
    if cuisine == DEFAULT_CUISINE and transcript:
        cuisine = await infer_cuisine_from_text(name, transcript)
        cuisine_source = "gemini_transcript"

    return {
        "name":                name,
        "address":             address,
        "place_id":            place_id,
        "cuisine":             cuisine,
        "cuisine_source":      cuisine_source,   # useful for debugging / monitoring
        "lat":                 lat,
        "lng":                 lng,
        "rating":              rating,
        "user_ratings_total":  user_ratings_total,
        "price_level":         price_level,
    }


async def infer_cuisine_from_text(place_name: str, transcript: str) -> str:
    """
    Tier 3: Classify cuisine from the TikTok transcript when both the type-map
    and name-based inference fail to resolve beyond "Other".

    Args:
        place_name: Resolved place name.
        transcript: Raw TikTok transcript text.

    Returns:
        A valid category string, or "Other" if Gemini is uncertain.
    """
    prompt = f"""You are classifying a Singapore food establishment by cuisine type.

Based on this TikTok transcript: "{transcript}"
What is the cuisine of the place "{place_name}"?

Categories: Japanese | Korean | Western | Local Hawker | Cafe / Dessert | Chinese | Other

Return ONLY the category name. If you cannot tell, return "Other"."""

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[prompt],
            config={"temperature": 0},
        )
        category = response.text.strip()
        return category if category in VALID_CATEGORIES else DEFAULT_CUISINE
    except Exception:
        return DEFAULT_CUISINE