"""
services/ingester.py
Phase 4 – Detect TikTok URLs, download images/frames, and extract text via Gemini Vision.

Supports:
  - Photo carousels: downloads all slide images from the page's embedded JSON
  - Videos: downloads the video via yt-dlp, then extracts key frames with ffmpeg
  - Both types: sends images to Gemini 2.0 Flash Vision to read on-screen text
"""

import os
import re
import json
import sys
import asyncio
import tempfile
import logging
import shutil
from pathlib import Path

import httpx
from bs4 import BeautifulSoup
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
GEMINI_MODEL = "gemini-2.5-flash"

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

_HEADERS = {
    "User-Agent": _USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
    "Cache-Control": "max-age=0",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

# ── URL detection ──────────────────────────────────────────────────────────────

_TIKTOK_PATTERN = re.compile(
    r"https?://(www\.|vm\.|vt\.)?tiktok\.com/\S+",
    re.IGNORECASE,
)


def is_tiktok_url(text: str) -> bool:
    """Return True if the input text is (or contains) a TikTok URL."""
    return bool(_TIKTOK_PATTERN.search(text.strip()))


# ── TikTok page data extraction ───────────────────────────────────────────────

async def _fetch_page_data(url: str) -> dict:
    """
    Fetch a TikTok post page and extract the embedded JSON data.
    Returns the itemStruct dict which contains caption, images, video info.
    """
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        r = await client.get(url, headers=_HEADERS)

    if r.status_code != 200:
        raise RuntimeError(f"TikTok page returned HTTP {r.status_code}")

    soup = BeautifulSoup(r.text, "html.parser")
    
    # Robust search: TikTok sometimes changes script IDs or hides data in anonymous scripts
    script_content = ""
    target_ids = ["__UNIVERSAL_DATA_FOR_REHYDRATION__", "SIGI_STATE", "RENDER_DATA"]
    
    # 1. Try by ID first
    for tid in target_ids:
        s = soup.find("script", id=tid)
        if s and s.string:
            script_content = s.string
            break
            
    # 2. Fallback: Search all scripts for itemStruct
    if not script_content:
        for s in soup.find_all("script"):
            if s.string and ("itemStruct" in s.string or "__DEFAULT_SCOPE__" in s.string):
                script_content = s.string
                break
                
    if not script_content:
        raise RuntimeError("Could not find TikTok page data (script tag missing or empty)")

    try:
        data = json.loads(script_content)
        
        # Structure A: __UNIVERSAL_DATA_FOR_REHYDRATION__
        if "__DEFAULT_SCOPE__" in data:
            scope = data.get("__DEFAULT_SCOPE__", {})
            # Webapp can have different keys for video detail
            detail_key = next((k for k in scope.keys() if "webapp." in k and "detail" in k), "webapp.video-detail")
            item = scope.get(detail_key, {}).get("itemInfo", {}).get("itemStruct", {})
        
        # Structure B: SIGI_STATE or RENDER_DATA root
        else:
            item = data.get("ItemModule", {}).get("next_item_id_placeholder", {}) # older structure fallback
            if not item:
                # Try finding itemStruct anywhere in the dict (brute force)
                def find_key(d, key):
                    if key in d: return d[key]
                    for v in d.values():
                        if isinstance(v, dict):
                            res = find_key(v, key)
                            if res: return res
                    return None
                item = find_key(data, "itemStruct") or {}
    except Exception as e:
        raise RuntimeError(f"Failed to parse TikTok JSON: {e}")

    if not item:
        raise RuntimeError("Could not parse TikTok post data (itemStruct empty)")

    return item


# ── Image downloading ─────────────────────────────────────────────────────────

async def _download_carousel_images(item: dict, tmpdir: str) -> list[str]:
    """
    Download slide images from a TikTok carousel post.
    Supports both the structured `itemStruct` from scraping and the
    `meta` dictionary from yt-dlp.
    """
    image_urls = []
    from_scrape = False
    
    # Pathway A: Scraped itemStruct — each entry IS a unique slide
    image_post = item.get("imagePost", {})
    images = image_post.get("images", [])
    if images:
        from_scrape = True
        for img in images:
            url_list = img.get("imageURL", {}).get("urlList", [])
            if url_list:
                image_urls.append(url_list[0])
    
    # Pathway B: yt-dlp metadata fallback — may contain duplicates
    if not image_urls:
        entries = item.get("entries", [])
        if entries:
            for entry in entries:
                if entry.get("url"):
                    image_urls.append(entry["url"])
        else:
            thumbnails = item.get("thumbnails", [])
            for thumb in thumbnails:
                url = thumb.get("url", "")
                if "photo" in url or "image" in url or "tos-alisg" in url:
                    image_urls.append(url)

    if not image_urls:
        return []

    # Deduplication: Only needed for Pathway B (yt-dlp).
    # Pathway A images are already one-per-slide from TikTok's own data.
    if not from_scrape:
        seen = set()
        deduped = []
        for url in image_urls:
            base = url.split('?')[0]  # strip query params for comparison
            if base not in seen:
                seen.add(base)
                deduped.append(url)
        image_urls = deduped

    logger.info(f"Downloading {len(image_urls)} carousel images")

    paths = []
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        for i, img_url in enumerate(image_urls):
            try:
                r = await client.get(img_url, headers={"Referer": "https://www.tiktok.com/"})
                if r.status_code == 200 and len(r.content) > 1000:
                    path = str(Path(tmpdir) / f"slide_{i}.jpg")
                    with open(path, "wb") as f:
                        f.write(r.content)
                    paths.append(path)
            except Exception as e:
                logger.warning(f"Failed to download image {img_url}: {e}")

    logger.info(f"Successfully downloaded {len(paths)} of {len(image_urls)} images")
    return paths


async def _extract_video_frames(url: str, tmpdir: str) -> list[str]:
    """
    Download video via yt-dlp and extract frames with ffmpeg.
    Extracts 1 frame every 3 seconds, capped at 10 frames.
    Returns list of local file paths.
    """
    video_path = str(Path(tmpdir) / "video.%(ext)s")

    ffmpeg_path = shutil.which("ffmpeg") or "ffmpeg"
    
    # Download video
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "yt_dlp",
        "--user-agent", _USER_AGENT,
        "--ffmpeg-location", ffmpeg_path,
        "--no-playlist",
        "--no-warnings",
        "--quiet",
        "-o", video_path,
        url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"yt-dlp video download failed: {stderr.decode()}")

    # Find downloaded video file
    video_files = list(Path(tmpdir).glob("video.*"))
    if not video_files:
        raise RuntimeError("No video file found after yt-dlp download")
    actual_video = str(video_files[0])

    # Extract frames with ffmpeg
    frame_pattern = str(Path(tmpdir) / "frame_%03d.jpg")
    proc = await asyncio.create_subprocess_exec(
        ffmpeg_path,
        "-i", actual_video,
        "-vf", "fps=1",          # 1 frame every 1 second (increased from 1/3)
        "-frames:v", "20",          # max 20 frames (increased from 10)
        "-q:v", "2",                # high quality JPEG
        frame_pattern,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()

    frames = sorted(Path(tmpdir).glob("frame_*.jpg"))
    return [str(f) for f in frames]


# ── Gemini Vision extraction ──────────────────────────────────────────────────

VISION_PROMPT = """You are analysing a TikTok food recommendation list from Singapore.

Look at ALL the images provided and extract EVERY unique food establishment mentioned (restaurant, cafe, hawker stall, bakery, or bar).

IMPORTANT:
- This is often a list of multiple recommendations. Do NOT stop after the first one.
- Extract the brand names and their associated locations/addresses if visible on screen.
- If the same place appears in multiple images, list it once.
- Capture all text overlays, captions, or annotations that identify a place.

Return ALL the unique text you can read from the images, preserving the original wording for the names.
If you cannot read any text, return "No text found"."""


async def _extract_text_from_images(image_paths: list[str]) -> str:
    """
    Send images to Gemini Vision and extract all visible text.
    """
    if not image_paths:
        return ""

    contents = []
    for path in image_paths:
        with open(path, "rb") as f:
            image_bytes = f.read()
        
        # Determine mime type from extension
        ext = Path(path).suffix.lower()
        mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
        
        contents.append(
            types.Part.from_bytes(data=image_bytes, mime_type=mime)
        )

    # Add the prompt at the end
    contents.append(VISION_PROMPT)

    response = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config={"temperature": 0},
    )

    return response.text.strip() if response.text else ""


# ── yt-dlp fallback helpers ────────────────────────────────────────────────────

async def _ytdlp_get_metadata(url: str) -> dict:
    """
    Fallback: use yt-dlp --dump-json to get post metadata (caption, etc.)
    when direct page scraping fails.
    """
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "yt_dlp",
        "--dump-json",
        "--user-agent", _USER_AGENT,
        "--no-warnings",
        "--quiet",
        url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"yt-dlp metadata failed: {stderr.decode()}")
    return json.loads(stdout.decode())


# ── Public API ─────────────────────────────────────────────────────────────────

async def ingest_tiktok(url: str) -> str:
    """
    Full Phase 4 pipeline for a single TikTok URL.

    1. Resolve shortlinks (.vt / .vm) to find hidden /photo/ properties.
    2. Rewrite /photo/ → /video/ for carousel compatibility.
    3. Try fetching embedded page data (caption + image URLs + location POIs).
    4. If page scraping fails, fall back to yt-dlp for metadata.
    5. Return caption + vision-extracted text combined.
    """
    # Step 0: Fully resolve mobile shortlinks to expose the true path
    if is_tiktok_url(url):
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                res = await client.get(url, headers=_HEADERS)
                url = str(res.url).split('?')[0] # Strip UTM and tracking params
        except Exception as e:
            logger.warning(f"Failed to resolve shortlink: {e}")

    # Normalise carousel URLs
    if "/photo/" in url:
        url = url.replace("/photo/", "/video/")

    # Step 1: Try page scraping first, fall back to yt-dlp
    item = None
    meta = None
    caption = ""
    try:
        item = await _fetch_page_data(url)
        caption = item.get("desc", "")
        
        # Extract native TikTok attached location POI
        poi = item.get("poi", {})
        poi_name = poi.get("name", "")
        poi_address = poi.get("address", "")
        if poi_name:
            caption += f"\n[Attached TikTok Location Tag: {poi_name}]"
        if poi_address:
            caption += f"\n[Location Address: {poi_address}]"
            
    except RuntimeError as e:
        logger.warning(f"Page scraping failed ({e}), falling back to yt-dlp")
        try:
            meta = await _ytdlp_get_metadata(url)
            caption = meta.get("description", "") or meta.get("title", "")
            
            # Extract fallback yt-dlp location mapping
            if meta.get("location"):
                caption += f"\n[Attached TikTok Location Tag: {meta['location']}]"
                
        except RuntimeError as e2:
            logger.warning(f"yt-dlp fallback also failed: {e2}")

    logger.info(f"Caption: {caption[:100]}...")

    is_carousel = False
    if item and "imagePost" in item and item["imagePost"].get("images"):
        is_carousel = True
    elif meta:
        # Check if yt-dlp detected entries (playlist) or image thumbnails
        if meta.get("entries") or meta.get("thumbnails"):
            is_carousel = True

    with tempfile.TemporaryDirectory() as tmpdir:
        if is_carousel:
            # Step 2a: Download carousel slides
            logger.info("Carousel detected – downloading slide images")
            source = item if item else meta
            image_paths = await _download_carousel_images(source, tmpdir)
        else:
            # Step 2b: Download video and extract frames
            logger.info("Video detected – downloading and extracting frames")
            try:
                image_paths = await _extract_video_frames(url, tmpdir)
            except RuntimeError as e:
                logger.warning(f"Frame extraction failed: {e}")
                image_paths = []

        # Step 3: Extract text from images via Gemini Vision
        vision_text = ""
        if image_paths:
            logger.info(f"Sending {len(image_paths)} images to Gemini Vision")
            vision_text = await _extract_text_from_images(image_paths)

    # Structure with priority labels so the extractor LLM knows
    # which source to trust when there are conflicts
    sections = []
    if caption:
        sections.append(f"=== CAPTION (PRIMARY SOURCE — trust this over OCR) ===\n{caption}")
    if vision_text and vision_text != "No text found":
        sections.append(f"=== OCR TEXT FROM IMAGES (SECONDARY — use only for details not in caption) ===\n{vision_text}")

    if not sections:
        raise RuntimeError("Could not extract any content from this TikTok post")

    return "\n\n".join(sections)

