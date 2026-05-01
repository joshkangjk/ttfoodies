# TTFoodie

A TikTok food discovery PWA for Singapore. Extract hidden gems from trending TikToks, map them to MRT stations, and save them to your personal library.

## Project Structure

This project is a monorepo containing both the Next.js frontend and the FastAPI backend.

```
ttfoodie/
├── app/                    # Next.js App Router (Frontend)
│   ├── api/share/          # Server-side bridge for iOS Shortcut
│   ├── components/         # Extracted UI components
│   ├── layout.tsx          # PWA metadata & layout
│   ├── page.tsx            # Main application logic
│   └── types.ts            # Shared TypeScript interfaces
├── components/             # Global UI components (Auth, Badges, etc.)
├── lib/                    # Shared libraries (Supabase client)
├── public/                 # PWA icons and static assets
├── services/               # Python Backend Services
│   ├── extractor.py        # Gemini Vision & LLM extraction
│   ├── enricher.py         # Google Places API enrichment
│   ├── mrt_mapper.py       # Haversine MRT mapping logic
│   └── ingester.py         # TikTok scraping & video processing
├── utils/                  # Python Utility functions
├── main.py                 # FastAPI Backend Entry Point
├── mrt_stations.json       # SG MRT station dataset
└── scripts/                # Legacy scripts and migrations
```

## Quick Start

### 1. Backend (FastAPI)
Requires Python 3.10+ and `ffmpeg`.

```bash
# Setup environment
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run server
uvicorn main:app --reload --port 8000
```

### 2. Frontend (Next.js)
Requires Node.js 18+.

```bash
npm install
npm run dev
```

## Environment Variables

### Backend (.env)
- `GEMINI_API_KEY`: For OCR and data extraction.
- `GOOGLE_PLACES_API_KEY`: For restaurant verification and details.
- `SUPABASE_URL`: Your Supabase project URL.
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key.
- `SUPABASE_SERVICE_ROLE_KEY`: For the `/api/share` bridge.

### Frontend (.env.local)
- `NEXT_PUBLIC_SUPABASE_URL`: Matches backend.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Matches backend.
- `NEXT_PUBLIC_API_URL`: `http://localhost:8000` (local) or your deployed API.

## PWA & iOS Integration
TTFoodie is optimized as an iOS PWA. It includes a custom **iOS Shortcut** workflow to bypass Safari's sharing limitations. 

Check the [Shortcut Setup Guide](file:///Users/joshuakang/.gemini/antigravity/brain/3f430e63-2fe2-4b67-8ad9-8840b19b6370/shortcut_setup_guide.md) for details on how to share directly from the TikTok app.
