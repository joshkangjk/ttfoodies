"use client";

import { useState } from "react";
import { Search, Loader2, MapPin, Utensils, Train, AlertCircle } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlaceResult {
  name: string;
  address: string;
  cuisine: string;
  lat: number;
  lng: number;
  nearest_mrt: string;
  verified: boolean;
}

// ── Cuisine badge colour map ───────────────────────────────────────────────────

const CUISINE_COLORS: Record<string, string> = {
  Japanese:       "bg-red-100 text-red-700",
  Korean:         "bg-orange-100 text-orange-700",
  Chinese:        "bg-yellow-100 text-yellow-700",
  Western:        "bg-blue-100 text-blue-700",
  "Cafe / Dessert":"bg-pink-100 text-pink-700",
  "Local Hawker": "bg-green-100 text-green-700",
  Other:          "bg-gray-100 text-gray-600",
  Unknown:        "bg-gray-100 text-gray-400",
};

function CuisineBadge({ cuisine }: { cuisine: string }) {
  const cls = CUISINE_COLORS[cuisine] ?? CUISINE_COLORS["Other"];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <Utensils className="h-3 w-3" />
      {cuisine}
    </span>
  );
}

// ── MRT badge ─────────────────────────────────────────────────────────────────

function MRTBadge({ station }: { station: string }) {
  const isUnknown = station === "Unknown";
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${isUnknown ? "text-gray-400 italic" : "text-gray-800"}`}>
      <Train className={`h-4 w-4 ${isUnknown ? "text-gray-300" : "text-emerald-500"}`} />
      {station}
    </span>
  );
}

// ── Results table ─────────────────────────────────────────────────────────────

function ResultsTable({ results }: { results: PlaceResult[] }) {
  if (results.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center gap-3 text-gray-400">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">No food places detected in that content.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 w-full overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
      {/* Desktop table */}
      <table className="hidden w-full text-left text-sm md:table">
        <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-5 py-3">Place Name</th>
            <th className="px-5 py-3">Cuisine</th>
            <th className="px-5 py-3">Nearest MRT</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 bg-white">
          {results.map((r, i) => (
            <tr key={i} className="group transition-colors hover:bg-gray-50/60">
              <td className="px-5 py-4">
                <div className="flex items-start gap-2">
                  <div>
                    {/* FIXED: Correct Google Maps Link Format */}
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="font-medium text-gray-900 hover:text-emerald-600 hover:underline transition-colors"
                    >
                      {r.name}
                    </a>
                    {r.address && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {r.address}
                      </p>
                    )}
                    {!r.verified && (
                      <span className="mt-1 inline-block rounded bg-yellow-50 px-1.5 py-0.5 text-xs text-yellow-600">
                        Unverified
                      </span>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-5 py-4">
                <CuisineBadge cuisine={r.cuisine} />
              </td>
              <td className="px-5 py-4">
                <MRTBadge station={r.nearest_mrt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <div className="divide-y divide-gray-100 md:hidden">
        {results.map((r, i) => (
          <div key={i} className="bg-white px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                {/* FIXED: Mobile now also has the clickable link */}
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-semibold text-gray-900 hover:text-emerald-600 hover:underline transition-colors"
                >
                  {r.name}
                </a>
                {!r.verified && (
                  <span className="mt-0.5 inline-block rounded bg-yellow-50 px-1.5 py-0.5 text-xs text-yellow-600 flex-shrink-0">
                    Unverified
                  </span>
                )}
                {r.address && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {r.address}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <CuisineBadge cuisine={r.cuisine} />
              <MRTBadge station={r.nearest_mrt} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page component ────────────────────────────────────────────────────────

export default function FoodDiscoveryPage() {
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [results, setResults]   = useState<PlaceResult[] | null>(null);
  const [error, setError]       = useState<string | null>(null);

  async function handleGenerate() {
    if (!input.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);

    // FIXED: Safe Timeout pattern that works across all TS/Node versions
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      // FIXED: Fallback URL so it doesn't crash if .env.local is missing
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      const res = await fetch(`${apiUrl}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input }),
        signal: controller.signal, 
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Server error ${res.status}`);
      }

      const data = await res.json();
      setResults(data.results ?? []);
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        setError("Request timed out (took longer than 15s). Please try again.");
      } else {
        setError("Something went wrong. Make sure your FastAPI backend is running!");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center px-4 py-16">
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          🍜 TikTok Food Discovery
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Paste a TikTok caption, transcript, or URL and we'll map every
          food place to its nearest MRT station.
        </p>
      </div>

      {/* Search bar */}
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <textarea
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm text-gray-800 shadow-sm outline-none placeholder:text-gray-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50"
            rows={3}
            placeholder="Paste a TikTok URL, caption, or transcript…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading || !input.trim()}
          className="inline-flex h-12 items-center justify-center gap-2 self-end rounded-xl bg-emerald-500 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 sm:h-auto sm:self-auto sm:py-3"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing…
            </>
          ) : (
            "Generate"
          )}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mt-6 flex w-full items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="mt-8 w-full space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-gray-100" />
          ))}
          <p className="mt-2 text-center text-xs text-gray-400">
            Extracting places and mapping MRT stations…
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && results !== null && <ResultsTable results={results} />}
    </main>
  );
}