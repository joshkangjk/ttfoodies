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
    "ramen_noodle_shop":            "Japanese",
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
    "hotpot_restaurant":            "Chinese",
    "szechuan_restaurant":          "Chinese",
    "sichuan_restaurant":           "Chinese",
    "congee_restaurant":            "Chinese",
    "roast_meat_restaurant":        "Chinese",
    "bak_kut_teh_restaurant":       "Chinese",
    "seafood_restaurant":           "Chinese",

    # ── Taiwanese ───────────────────────────────────────────────────────────
    "taiwanese_restaurant":         "Taiwanese",

    # ── Italian ─────────────────────────────────────────────────────────────
    "italian_restaurant":           "Italian",
    "pizza_restaurant":             "Italian",
    "pizzeria":                     "Italian",

    # ── French ──────────────────────────────────────────────────────────────
    "french_restaurant":            "French",

    # ── Mexican ─────────────────────────────────────────────────────────────
    "mexican_restaurant":           "Mexican",
    "tex_mex_restaurant":           "Mexican",

    # ── Spanish ─────────────────────────────────────────────────────────────
    "spanish_restaurant":           "Spanish",
    "tapas_bar":                    "Spanish",

    # ── Mediterranean ───────────────────────────────────────────────────────
    "greek_restaurant":             "Mediterranean",
    "mediterranean_restaurant":     "Mediterranean",

    # ── American ────────────────────────────────────────────────────────────
    "american_restaurant":          "American",
    "hamburger_restaurant":         "American",
    "burger_restaurant":            "American",
    "steak_house":                  "American",
    "steakhouse":                   "American",
    "barbecue_restaurant":          "American",

    # ── Brunch ──────────────────────────────────────────────────────────────
    "brunch_restaurant":            "Brunch",
    "breakfast_restaurant":         "Brunch",

    # ── Western (Catch-all for European) ────────────────────────────────────
    "british_restaurant":           "Western",
    "german_restaurant":            "Western",
    "austrian_restaurant":          "Western",
    "swiss_restaurant":             "Western",
    "russian_restaurant":           "Western",
    "portuguese_restaurant":        "Western",
    "brazilian_restaurant":         "Western",
    "sandwich_shop":                "Western",
    "sandwiches_restaurant":        "Western",
    "deli":                         "Western",
    "pub":                          "Western",
    "gastropub":                    "Western",

    # ── Cafe / Dessert ──────────────────────────────────────────────────────
    "cafe":                         "Cafe",
    "coffee_shop":                  "Cafe",
    "tea_house":                    "Cafe",
    "bubble_tea_shop":              "Cafe",
    "boba_tea_restaurant":          "Cafe",
    "juice_bar":                    "Cafe",
    "smoothie_bar":                 "Cafe",

    # ── Dessert ─────────────────────────────────────────────────────────────
    "dessert_shop":                 "Dessert",
    "dessert_restaurant":           "Dessert",
    "bakery":                       "Dessert",
    "patisserie":                   "Dessert",
    "ice_cream_shop":               "Dessert",
    "donut_shop":                   "Dessert",
    "acai_shop":                    "Dessert",
    "waffle_shop":                  "Dessert",
    "crepe_restaurant":             "Dessert",
    "chocolate_shop":               "Dessert",
    "confectionery":                "Dessert",

    # ── Malay ───────────────────────────────────────────────────────────────
    "malaysian_restaurant":         "Malay",
    "singaporean_restaurant":       "Malay",

    # ── Indonesian ──────────────────────────────────────────────────────────
    "indonesian_restaurant":        "Indonesian",
    "nasi_padang_restaurant":       "Indonesian",

    # ── Peranakan ───────────────────────────────────────────────────────────
    # (No dedicated Google type — resolved via Tier 2/3 AI inference)

    # ── Local Hawker (Format-based) ─────────────────────────────────────────
    "hawker_centre":                "Local Hawker",
    "food_court":                   "Local Hawker",
    "kopitiam":                     "Local Hawker",
    "meal_takeaway":                "Local Hawker",
    "chicken_rice_restaurant":      "Local Hawker",
    "laksa_restaurant":             "Local Hawker",
    "satay_restaurant":             "Local Hawker",

    # ── Indian ──────────────────────────────────────────────────────────────
    "indian_restaurant":            "Indian",
    "south_indian_restaurant":      "Indian",
    "north_indian_restaurant":      "Indian",

    # ── Pakistani ───────────────────────────────────────────────────────────
    "pakistani_restaurant":         "Pakistani",
    "bangladeshi_restaurant":       "Pakistani",

    # ── Thai ────────────────────────────────────────────────────────────────
    "thai_restaurant":              "Thai",

    # ── Vietnamese ──────────────────────────────────────────────────────────
    "vietnamese_restaurant":        "Vietnamese",
    "pho_restaurant":               "Vietnamese",

    # ── Filipino ────────────────────────────────────────────────────────────
    "filipino_restaurant":          "Filipino",

    # ── Burmese ─────────────────────────────────────────────────────────────
    "burmese_restaurant":           "Burmese",
    "cambodian_restaurant":         "Burmese",  # SE Asian grouping
    "laotian_restaurant":           "Burmese",

    # ── Middle Eastern ──────────────────────────────────────────────────────
    "middle_eastern_restaurant":    "Middle Eastern",
    "lebanese_restaurant":          "Middle Eastern",
    "turkish_restaurant":           "Middle Eastern",
    "arabic_restaurant":            "Middle Eastern",
    "persian_restaurant":           "Middle Eastern",
    "afghani_restaurant":           "Middle Eastern",

    # ── African ─────────────────────────────────────────────────────────────
    "african_restaurant":           "African",
    "ethiopian_restaurant":         "African",

    # ── Fusion ──────────────────────────────────────────────────────────────
    "fusion_restaurant":            "Fusion",
    "international_restaurant":     "Fusion",

    # ── Bar & Drinks ────────────────────────────────────────────────────────
    "bar":                          "Bar & Drinks",
    "night_club":                   "Bar & Drinks",

    # ── Other (Catch-all) ───────────────────────────────────────────────────
    "hawaiian_restaurant":          "Other",
    "poke_restaurant":              "Other",
    "vegetarian_restaurant":        "Other",
    "vegan_restaurant":             "Other",
    "health_food_restaurant":       "Other",
    "organic_restaurant":           "Other",
    "buffet_restaurant":            "Other",
    "fast_food_restaurant":         "Other",
    "food_stand":                   "Other",
}

DEFAULT_CUISINE = "Other"

# Singapore bounding box used as location bias
SINGAPORE_LAT = 1.3521
SINGAPORE_LNG = 103.8198


VALID_CATEGORIES = [
    # East Asian
    "Japanese", "Korean", "Chinese", "Taiwanese",
    # Southeast Asian
    "Malay", "Indonesian", "Peranakan", "Thai", "Vietnamese", "Filipino", "Burmese",
    # South Asian
    "Indian", "Pakistani",
    # Western (granular)
    "Italian", "French", "Mexican", "Spanish", "Mediterranean", "American", "Brunch", "Western",
    # Middle Eastern & African
    "Middle Eastern", "African",
    # Lifestyle
    "Cafe", "Dessert", "Bar & Drinks", "Fusion",
    # Singapore-specific
    "Local Hawker",
]


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

    prompt = f"""You are classifying a Singapore food establishment by its SPECIFIC cuisine type.

Place name : {place_name}
Address    : {address}{context_block}

Using the name, address, and any context above, choose ONE category from this list:
  Japanese | Korean | Chinese | Taiwanese |
  Malay | Indonesian | Peranakan | Thai | Vietnamese | Filipino | Burmese |
  Indian | Pakistani |
  Italian | French | Mexican | Spanish | Mediterranean | American | Brunch | Western |
  Middle Eastern | African |
  Cafe | Dessert | Bar & Drinks | Fusion |
  Local Hawker | Other

Guidelines:
- Be as SPECIFIC as possible. Prefer "Italian" over "Western", "Malay" over "Local Hawker".
- "Local Hawker" = ONLY for hawker centres, food courts, and kopitiams (the dining format, not the cuisine).
- "Malay" = Malay or Singaporean cuisine (nasi lemak, rendang) at ANY price point including fine dining.
- "Indonesian" = Indonesian cuisine (nasi padang, gudeg, soto ayam).
- "Peranakan" = Nyonya / Straits Chinese cuisine (laksa, ayam buah keluak, kueh).
- "Cafe" = Coffee shops, tea houses, bubble tea.
- "Dessert" = Bakeries, patisseries, ice cream, dedicated dessert spots.
- "Brunch" = Brunch-focused or breakfast-focused restaurants.
- "American" = Burgers, steaks, BBQ, American-style diners.
- "Western" = General European cuisines not covered by Italian/French/Spanish/Mediterranean.
- "Fusion" = Explicitly cross-cuisine or "modern international" concepts.
- Brand signals: "So Pho" → Vietnamese, "Haidilao" → Chinese, "Nando's" → Western,
  "Old Chang Kee" → Local Hawker, "The Coconut Club" → Malay, "National Kitchen by Violet Oon" → Peranakan.
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
    prompt = f"""You are classifying a Singapore food establishment by its SPECIFIC cuisine type.

Based on this TikTok transcript: "{transcript}"
What is the cuisine of the place "{place_name}"?

Categories:
  Japanese | Korean | Chinese | Taiwanese |
  Malay | Indonesian | Peranakan | Thai | Vietnamese | Filipino | Burmese |
  Indian | Pakistani |
  Italian | French | Mexican | Spanish | Mediterranean | American | Brunch | Western |
  Middle Eastern | African |
  Cafe | Dessert | Bar & Drinks | Fusion |
  Local Hawker | Other

Be as SPECIFIC as possible. Return ONLY the category name. If you cannot tell, return "Other"."""


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