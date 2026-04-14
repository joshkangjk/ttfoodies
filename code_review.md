# TTFoodie — Critical Project Review

## 1. Project Summary

TTFoodie is a TikTok food discovery tool for Singapore. The workflow:

1. User pastes a TikTok URL (or raw text) into a Next.js frontend.
2. A FastAPI backend resolves the URL, scrapes the page, downloads images/video, runs Gemini Vision OCR, and extracts restaurant names via an LLM.
3. Candidate names are validated and enriched via Google Places API (address, rating, price, cuisine type).
4. Each place is mapped to its nearest Singapore MRT station using Haversine distance against a local JSON dataset.
5. Users can save places to Supabase (with RLS per user) and view them in a "Saved" tab.
6. The app is intended to ship as an iOS PWA on Vercel.

---

## 2. Workflow Map

```
User Input (URL or text)
       │
       ▼
┌─────────────────────┐
│  /generate endpoint  │  ◄── Single entry point
└──────────┬──────────┘
           │
     is TikTok URL?
      ╱          ╲
    yes           no
     │             │
     ▼             │
┌──────────┐       │
│ ingester │       │
│ .py      │       │
│          │       │
│ 1. Resolve shortlink    │
│ 2. Scrape page JSON     │
│ 3. Extract caption+POI  │
│ 4. Download images/video│
│ 5. Gemini Vision OCR    │
└──────────┬──────────┘   │
           │              │
           ▼              ▼
    Combined text string (caption + OCR)
           │
           ▼
┌──────────────────┐
│ extractor.py     │
│ Gemini NER       │
│ caption → OCR    │
│ fallback         │
└────────┬─────────┘
         │
   candidate names[]
         │
         ▼
┌──────────────────┐
│ deduplication.py │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│ enricher.py      │────▶│ mrt_mapper.py    │
│ Google Places    │     │ Haversine + JSON │
│ Text Search      │     └──────────────────┘
│ + cuisine infer  │
└────────┬─────────┘
         │
         ▼
   EnrichResponse → Frontend renders results
                     User clicks Save → Supabase insert + Google Maps deeplink
```

---

## 3. Issues Found

### 🔴 CRITICAL — Security

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | **API keys committed to git** | [.env](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/.env) contains `GEMINI_API_KEY` and `GOOGLE_PLACES_API_KEY` in plaintext. With only 1 commit on `main`, these keys are baked into history forever. | Anyone who clones the repo (or if it goes public) gets free access to your Google Cloud billing account. **Rotate these keys immediately.** |
| 2 | **Backend is fully unauthenticated** | [main.py:29-35](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/main.py#L29-L35) — CORS is open to `localhost:3000` only, but there is zero auth on `/generate`, `/extract`, `/enrich`. | Once deployed to Vercel, anyone can call your FastAPI backend directly and burn your Gemini/Places quota. The Supabase auth protects the frontend only — the backend is completely exposed. |
| 3 | **No duplicate-save guard** | [page.tsx:356-373](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/app/page.tsx#L356-L373) — `handleSavePlace` does a raw `INSERT` with no uniqueness check. | Clicking "Save" twice on the same place creates duplicate rows. There's no `UNIQUE` constraint on `(user_id, place_id)` and no frontend debounce/dedup. |

### 🟠 HIGH — Reliability & Correctness

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 4 | **Shortlink resolver uses `follow_redirects=True` but then checks for 301/302** | [ingester.py:246-251](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/services/ingester.py#L246-L251) — `httpx.AsyncClient(follow_redirects=True)` means the client follows all redirects automatically, so `res.status_code` will never be 301/302/307. The `if` branch is dead code; you're relying on `str(res.url)` in the `else`, which happens to work but only by accident. | Confusing code that works by luck. If httpx behavior changes, this breaks silently. Use `follow_redirects=False` and handle the `Location` header manually, OR use `follow_redirects=True` and just read `res.url`. |
| 5 | **`_fetch_page_data` uses a fresh `httpx.AsyncClient` per call without `follow_redirects`** | [ingester.py:57](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/services/ingester.py#L57) — uses `follow_redirects=True` here, but the shortlink resolver already resolved. However, calling `_fetch_page_data` directly with a shortlink (bypassing `ingest_tiktok`) would fail. | Minor, but indicates the function isn't defensively written. |
| 6 | **Hardcoded `/opt/homebrew/bin/ffmpeg` path** | [ingester.py:123, 145](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/services/ingester.py#L123) | This will fail on Vercel (Linux), on any non-M1 Mac, and on CI. Should use `shutil.which("ffmpeg")` or just `"ffmpeg"` and let PATH resolve it. This is a **deployment blocker** for Vercel. |
| 7 | **No error handling on Supabase `insert`** | [page.tsx:359-372](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/app/page.tsx#L359-L372) — The `await supabase.from('saved_places').insert({...})` return value is ignored. | If RLS blocks the insert, or if there's a network error, the user gets no feedback. Google Maps opens (fire-and-forget), but the save silently fails. |
| 8 | **`enricher.py` creates a new `httpx.AsyncClient` per call** | [enricher.py:75](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/services/enricher.py#L75) | When processing a TikTok post with 5+ places, this creates 5+ separate TCP connections to Google. Should use a shared client (or at least a session-scoped one) for connection pooling. |
| 9 | **`extractor.py` uses synchronous Gemini client in async function** | [extractor.py:38-52](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/services/extractor.py#L38-L52) — `_call_gemini` is `async def` but calls `client.models.generate_content()` synchronously. | This blocks the event loop during the LLM call. Use the async Gemini client or wrap in `asyncio.to_thread()`. Same issue in `enricher.py:151`. |
| 10 | **LLM prompt is brittle and growing unwieldy** | [extractor.py:13-35](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/services/extractor.py#L13-L35) — The prompt now has an EXCEPTION and a CRITICAL OVERRIDE TO THE EXCEPTION. | This is a red flag for prompt engineering. Every edge case adds another "CRITICAL" rule. LLMs don't reliably follow chains of overriding rules. Consider a deterministic pre-filter (check the POI name against a known list of SG neighborhoods/regions) *before* sending to the LLM, rather than asking the LLM to be both a geography classifier and an NER agent. |

### 🟡 MEDIUM — Architecture & Maintainability

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 11 | **README is completely stale** | [README.md](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/README.md) — References `backend/` and `frontend/` subdirectory structure that doesn't exist. Mentions OpenAI (`OPENAI_API_KEY`), `haversine.py` in a separate utils file. Mentions a `data/` directory. None of this matches reality. | Anyone (including future you) reading this README will be misled about the entire project structure. |
| 12 | **`mrt_mapper.py` docstring says `utils/haversine.py`** | [mrt_mapper.py:2](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/services/mrt_mapper.py#L2) | Minor but shows copy-paste drift. |
| 13 | **MAX_DISTANCE_KM docstring says "2 km" but code says 3.0** | [mrt_mapper.py:15 vs 71](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/services/mrt_mapper.py#L15) — `MAX_DISTANCE_KM = 3.0` but the docstring on line 71 says "more than MAX_DISTANCE_KM (2 km)". README also says "2 km". | Misleading documentation. |
| 14 | **`convert.py` and `LTAMRTStationExitGEOJSON.geojson` are dead weight** | Root directory — These are one-time data preparation scripts that already produced `mrt_stations.json`. | 207KB GeoJSON file shipping in the repo for no reason. Move to a `scripts/` folder or delete. |
| 15 | **Entire frontend is a single 503-line file** | [page.tsx](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/app/page.tsx) — Contains `ResultsTable`, `CuisineBadge`, `MRTBadge`, `FoodDiscoveryPage`, `App`, utility functions, and all state management in one file. | Hard to maintain. Extract components (`ResultsTable.tsx`, `DiscoverTab.tsx`, `SavedTab.tsx`) and a `hooks/useAuth.ts`. |
| 16 | **No TypeScript types shared between frontend and backend** | `PlaceResult` is defined as a Pydantic model in Python AND a TypeScript interface in `page.tsx`. | If you add a field to one and forget the other, the frontend silently drops data or crashes. |
| 17 | **`Tiktok Food Ideas PRD.docx` is a binary Word doc in the repo** | Root directory | Not diffable, not readable in a code review. Convert to markdown. |

### 🔵 LOW — Polish & Minor Issues

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 18 | **`package.json` has no `name` or `version` field** | [package.json](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/package.json) | npm warnings, and Vercel may auto-assign a random project name. |
| 19 | **No loading/error state when fetching saved places** | [page.tsx:327-348](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/app/page.tsx#L327-L348) — `fetchSavedPlaces` ignores the `error` return from Supabase. | If the DB query fails, the user sees an infinite spinner. |
| 20 | **`interval` variable used before assignment** | [Auth.tsx:26](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/components/Auth.tsx#L26) — `clearInterval(interval)` in the `else if` branch runs when `interval` is undefined (timer starts at 0, `sent` is false). | No runtime crash due to JS semantics, but it's a code smell. ESLint would flag this. |
| 21 | **Missing `eslint` and `prettier` config** | No `.eslintrc`, no `.prettierrc` | Inconsistent formatting will creep in as the codebase grows. |
| 22 | **PWA manifest has only one icon size** | [manifest.ts:12-18](file:///Users/joshuakang/Desktop/side%20projects/ttfoodie/app/manifest.ts#L12-L18) — Only `'any'` size. iOS Safari PWA requires specific sizes (180×180 for `apple-touch-icon`, 512×512 for splash). | The PWA will work but may show a blank/default icon on the iOS home screen. |

---

## 4. Quality Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Modularity** | ⭐⭐⭐ | Backend services are well-separated (ingester → extractor → enricher → mapper). Frontend is a monolith. |
| **Error Handling** | ⭐⭐ | Backend has decent try/catch chains. Frontend silently swallows Supabase errors. No retry logic anywhere. |
| **Security** | ⭐ | API keys in git, no backend auth, no rate limiting. |
| **Documentation** | ⭐ | README is entirely wrong. No inline API docs beyond basic docstrings. |
| **Testability** | ⭐ | Zero tests. No test directory, no pytest config, no Jest config. You've been testing by running ad-hoc scripts in `/tmp`. |
| **Deployment Readiness** | ⭐⭐ | PWA manifest exists. But ffmpeg path is hardcoded, backend has no Dockerfile, CORS is localhost-only. |
| **Scalability** | ⭐⭐ | LRU cache on MRT data is good. But synchronous LLM calls block the event loop, and each enrichment spawns a new HTTP client. |

---

## 5. Prioritised Recommendations

### 🔴 Do Immediately (before any deployment)

1. **Rotate your API keys.** Go to Google Cloud Console right now and regenerate both `GEMINI_API_KEY` and `GOOGLE_PLACES_API_KEY`. The current ones are compromised the moment this repo is shared.

2. **Add backend authentication.** At minimum, add a shared secret header (`X-API-Key`) that the frontend passes and the backend validates. Better: have the frontend pass the Supabase JWT and verify it on the backend.

3. **Fix the ffmpeg path.** Replace:
   ```python
   "/opt/homebrew/bin/ffmpeg"
   ```
   with:
   ```python
   shutil.which("ffmpeg") or "ffmpeg"
   ```
   Same for the `--ffmpeg-location` flag in yt-dlp.

4. **Add a unique constraint on saved_places.** In Supabase SQL editor:
   ```sql
   ALTER TABLE saved_places ADD CONSTRAINT unique_user_place UNIQUE (user_id, place_id);
   ```
   Then use `upsert` instead of `insert` in the frontend.

### 🟠 Do Before Sharing With Friends

5. **Rewrite the README** to match reality. Kill the `backend/frontend` fiction. Document the actual structure, actual env vars, and actual setup steps.

6. **Make the LLM prompt deterministic for geographic filtering.** Instead of asking Gemini to decide if "Bukit Timah" is a neighborhood, maintain a simple set:
   ```python
   SG_REGIONS = {"singapore", "bukit timah", "orchard", "jurong", ...}
   ```
   Strip these from the POI tag *before* sending to the LLM. This removes an entire class of edge cases without adding more prompt complexity.

7. **Handle Supabase errors in the frontend.** Check the `error` return on every Supabase call and show a toast/alert.

8. **Add duplicate-save prevention.** Before inserting, query for existing `place_id` + `user_id`. Or use `upsert` with the unique constraint from #4.

### 🟡 Do When You Have Time

9. **Split `page.tsx` into components.** At minimum: `ResultsTable.tsx`, `DiscoverTab.tsx`, `SavedTab.tsx`, `hooks/useAuth.ts`.

10. **Add basic tests.** Even 5 pytest tests covering the happy path of each service would catch regressions. The ad-hoc `/tmp` scripts you've been running should be formalized into a `tests/` directory.

11. **Switch to async Gemini client** (or wrap sync calls in `asyncio.to_thread`) to stop blocking the event loop.

12. **Use a shared `httpx.AsyncClient`** in `enricher.py` via a module-level client or FastAPI dependency injection.

13. **Clean up dead files.** Delete or move `convert.py`, `LTAMRTStationExitGEOJSON.geojson`, `Tiktok Food Ideas PRD.docx`.

14. **Fix all stale docstrings.** `mrt_mapper.py` header, MAX_DISTANCE_KM comment, README references to OpenAI.

### 🔵 Nice to Have

15. **Add rate limiting** to the FastAPI backend (e.g., `slowapi`).
16. **Add a "Delete" button** in the Saved tab.
17. **Add multiple PWA icon sizes** for proper iOS home screen rendering.
18. **Set up ESLint + Prettier** for consistent formatting.
19. **Add a `Dockerfile`** for the backend so it can deploy to Railway/Fly.io alongside the Vercel frontend.

---

## 6. Deployment Blockers Summary

If you try to deploy this to Vercel + a cloud Python host today, the following things will break:

| Blocker | Why |
|---------|-----|
| Hardcoded `/opt/homebrew/bin/ffmpeg` | Linux servers don't have this path |
| CORS allows only `localhost:3000` | Vercel frontend will be at `*.vercel.app` |
| No backend auth | Anyone can call your API |
| yt-dlp + ffmpeg as system deps | Need to be installed on the server (Dockerfile or buildpack) |
| Backend and frontend are in the same repo but different runtimes | Need separate deployment configs (Vercel for Next.js, separate service for FastAPI) |

---

> **Bottom line:** The core pipeline (scrape → extract → enrich → map) is well-designed and the edge-case work on shortlinks and POI tags shows good iterative debugging. But the project has accumulated significant security debt (keys in git, no backend auth) and operational debt (stale docs, no tests, hardcoded paths) that will bite you the moment you share it or deploy it.
