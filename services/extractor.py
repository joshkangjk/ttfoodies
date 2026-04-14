"""
services/extractor.py
Phase 1 – Extract candidate place names from raw text using Google Gemini.
"""

import os
import json
from google import genai

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
MODEL = "gemini-2.5-flash"

SYSTEM_PROMPT = """
You are a specialized Named Entity Recognition (NER) agent focused on the Singapore Food & Beverage (F&B) scene. 

Your task: Extract the official name of the food establishment (restaurant, cafe, hawker stall, bakery, or bar) from OCR or caption data.

### Extraction Logic:
1. **Identify Anchor Points:** Prioritize text immediately following or preceding:
   - Emojis: 📍, 📌, 🏢, 🗺️, 🏠, ✨
   - Keywords: "Location:", "Attached TikTok Location Tag:", "Address:", "Located at:", "Found at:", "We visited:", "@", "Check out"
2. **Distinguish Proper Nouns:** Extract only specific brand names (e.g., "Aoki Sushi"). Ignore generic phrases (e.g., "the sushi place," "this ramen shop," "hidden gem").
3. **Singapore Context Awareness:** 
   - Recognize suffixes common in Singapore like "Market & Food Centre," "Coffeehouse," "Eating House," "Boulangerie," or "Bakery."
   - If a place is a specific stall within a hawker centre, extract the stall name (e.g., "Tian Tian Hainanese Chicken Rice" rather than just "Maxwell Food Centre").
4. **Negative Constraints (Do NOT Extract):**
   - Dishes or Ingredients (e.g., "Laksa," "Iced Milo").
   - Physical Addresses (e.g., "12 Orchard Road" or "S012345").
   - Generic descriptors (e.g., "New Cafe," "Viral Spot," "Dinner").
   - Do NOT include cuisine types unless they are part of the establishment name.

Respond with a JSON object in exactly this format. If no food places are mentioned, return an empty list:
{"places": ["Place Name 1", "Place Name 2"]}
"""

async def _call_gemini(text_chunk: str) -> list[str]:
    response = client.models.generate_content(
        model=MODEL,
        contents=[
            f"{SYSTEM_PROMPT}\n\n---\n\n{text_chunk}",
        ],
        config={
            "temperature": 0,
            "response_mime_type": "application/json",
        },
    )
    content = response.text or "{}"
    parsed  = json.loads(content)
    places  = parsed.get("places", [])
    return [str(p).strip() for p in places if str(p).strip()]


# List of broad geographical regions to filter out from POI tags
SG_REGIONS = {
    "singapore", "bukit timah", "orchard", "orchard road", "cbd", "central business district",
    "jurong", "tampines", "bedok", "yishun", "woodlands", "pasir ris", "ang mo kio",
    "hougang", "sengkang", "punggol", "serangoon", "clementi", "queenstown", 
    "toa payoh", "bukit merah", "geylang", "kallang", "marine parade", "novena",
    "rochor", "downtown core", "museum", "newton", "outram", "river valley",
    "singapore river", "straits view", "marina south", "marina east", "southern islands",
    "balestier", "katong", "east coast", "holland village", "tiong bahru", "chinatown",
    "bugis", "little india", "clarke quay", "boat quay", "robertson quay", "sentosa"
}

import re

async def extract_place_names(text: str) -> list[str]:
    """
    Call Gemini to extract candidate restaurant names from raw text.
    Uses a 2-stage process: tries caption first, falls back to OCR if empty.
    """
    caption_text = text
    ocr_text = ""
    
    if "=== OCR TEXT FROM IMAGES" in text:
        parts = text.split("=== OCR TEXT FROM IMAGES")
        caption_text = parts[0].strip()
        ocr_text = parts[1].strip()

    # Deterministic Filtering: Strip broad geographical tags from the caption
    # This prevents the LLM from getting stuck on "Bukit Timah" and forces it
    # to find the actual restaurant name in OCR or elsewhere.
    poi_match = re.search(r"\[Attached TikTok Location Tag: (.*?)\]", caption_text)
    if poi_match:
        tag_content = poi_match.group(1).strip()
        if tag_content.lower() in SG_REGIONS:
            # Strip the detected region tag entirely
            caption_text = re.sub(r"\[Attached TikTok Location Tag:.*?\]", "", caption_text).strip()

    # Stage 1: Try extracting from caption ONLY
    if caption_text:
        places = await _call_gemini(caption_text)
        if places:
            return places  # Stop immediately! Prevents OCR from overriding things.

    # Stage 2: Fall back to OCR ONLY if caption yielded no places
    if ocr_text:
        return await _call_gemini(ocr_text)

    return []
