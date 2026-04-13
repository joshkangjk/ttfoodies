"""
services/extractor.py
Phase 1 – Extract candidate place names from raw text using OpenAI.
"""

import os
import json
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

SYSTEM_PROMPT = """
You are a food place name extractor specialised in Singapore content.

Given a TikTok video transcript or caption, identify ONLY the names of
restaurants, hawker stalls, cafes, or food establishments mentioned.

Rules:
- Return ONLY real-sounding place names, not generic food categories.
- Do NOT include cuisine types (e.g. "ramen", "sushi") unless they are
  part of the establishment name.
- Do NOT assign cuisine labels — that happens in a later step.
- If no food places are mentioned, return an empty list.

Respond with a JSON object in exactly this format:
{"places": ["Place Name 1", "Place Name 2"]}
"""

async def extract_place_names(text: str) -> list[str]:
    """
    Call GPT-4o to extract candidate restaurant names from raw text.

    Args:
        text: Raw transcript or caption string.

    Returns:
        List of candidate place name strings.
    """
    response = await client.chat.completions.create(
        model="gpt-4o",
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": text},
        ],
    )

    content = response.choices[0].message.content or "{}"
    parsed  = json.loads(content)
    places  = parsed.get("places", [])

    # Sanitise: ensure we have a list of non-empty strings
    return [str(p).strip() for p in places if str(p).strip()]
