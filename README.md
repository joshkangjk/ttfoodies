# TikTok Food Discovery — Project Structure

```
project/
├── backend/
│   ├── main.py                     # FastAPI app: /extract  /enrich  /generate
│   ├── requirements.txt
│   ├── .env                        # OPENAI_API_KEY, GOOGLE_PLACES_API_KEY
│   ├── data/
│   │   └── mrt_stations.json       # 70+ SG MRT stations (name, line, lat, lng)
│   ├── services/
│   │   ├── extractor.py            # Phase 1 – GPT-4o LLM extraction
│   │   ├── enricher.py             # Phase 2 – Google Places validation & cuisine
│   │   └── mrt_mapper.py           # Phase 3 – thin re-export of haversine util
│   └── utils/
│       ├── haversine.py            # Haversine formula + find_nearest_mrt()
│       └── deduplication.py        # Name normalisation + similarity dedup
│
└── frontend/
    └── app/
        └── page.tsx                # Next.js App Router page component
```

## Quick Start

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add your API keys
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

## API Endpoints

| Method | Path        | Purpose                                              |
|--------|-------------|------------------------------------------------------|
| POST   | `/extract`  | Text → `{candidates: string[]}`                      |
| POST   | `/enrich`   | Candidates → enriched place list with MRT            |
| POST   | `/generate` | Combined single-shot: text → full enriched results   |

## MRT Dataset Schema

```json
[
  {
    "name": "Orchard",
    "line": "NS",
    "lat": 1.30421,
    "lng": 103.83231
  }
]
```

Fields: `name` (string), `line` (string, e.g. "EW/NS"), `lat` (float), `lng` (float).
Add/remove stations freely — the Haversine mapper loads the full list dynamically.

## Key Design Decisions

- **Two-phase separation**: `/extract` is LLM-only (fast, cheap).
  `/enrich` hits external APIs. Keeping them separate lets you test
  extraction independently.
- **Deduplication before enrichment**: Deduplicated in Python, not at
  the DB level, so you avoid burning Google Places quota on duplicates.
- **`lru_cache` on MRT data**: The JSON file is loaded once per process,
  not on every request.
- **2 km threshold**: `find_nearest_mrt` returns "Unknown" when the
  closest station exceeds 2 km — avoids misleading results for places
  in industrial or remote areas of Singapore.
