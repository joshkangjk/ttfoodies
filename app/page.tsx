"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Loader2, MapPin, Utensils, Train, AlertCircle, Link, FileText, Star, DollarSign, BookmarkPlus, Bookmark, LogOut, ArrowRight, ExternalLink } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import Auth from "../components/Auth";
import type { Session } from "@supabase/supabase-js";

// ── TikTok URL detection (mirrors backend logic) ───────────────────────────────

const TIKTOK_PATTERN = /https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/\S+/i;

function isTikTokUrl(text: string): boolean {
  return TIKTOK_PATTERN.test(text.trim());
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlaceResult {
  name: string;
  address: string;
  place_id?: string;
  cuisine: string;
  lat: number;
  lng: number;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  nearest_mrt: string;
  verified: boolean;
}

function formatPricePax(level?: number) {
  if (!level) return "Price varies";
  if (level === 1) return "< $10";
  if (level === 2) return "$10–$30";
  if (level === 3) return "$30–$60";
  if (level >= 4) return "$60+";
  return "Price varies";
}

function getGoogleMapsUrl(r: PlaceResult) {
  if (r.place_id) {
    return `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}&query_place_id=${r.place_id}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.address || "Singapore"}`)}`;
}

// ── UI Components ─────────────────────────────────────────────────────────────

function CuisineBadge({ cuisine }: { cuisine: string }) {
  // Use semantic badge styles from globals.css
  const cls = cuisine === "Other" || cuisine === "Unknown" ? "badge-neutral" : "badge-accent";
  return (
    <span className={`badge ${cls}`}>
      {cuisine}
    </span>
  );
}

function MRTBadge({ station }: { station: string }) {
  const isUnknown = station === "Unknown";
  if (isUnknown) return <span className="badge badge-neutral italic opacity-50">Private Transport</span>;
  
  return (
    <span className="mrt-badge">
      {station}
    </span>
  );
}

function PriceIndicator({ level }: { level?: number }) {
  return (
    <div className="price-dots">
      {[1, 2, 3, 4].map((i) => (
        <div 
          key={i} 
          className={`price-dots__dot ${level && i <= level ? 'price-dots__dot--filled' : ''}`}
          title={formatPricePax(level)}
        />
      ))}
    </div>
  );
}

// ── Results Table ─────────────────────────────────────────────────────────────

function ResultsTable({ 
  results, 
  onSave, 
  savedIds = new Set(), 
  isSavedTab = false 
}: { 
  results: PlaceResult[], 
  onSave?: (r: PlaceResult) => void, 
  savedIds?: Set<string>, 
  isSavedTab?: boolean 
}) {
  if (results.length === 0) {
    return (
      <div className="empty-state mt-16">
        <AlertCircle className="empty-state__icon" />
        <h3 className="empty-state__title">No discoveries found</h3>
        <p className="empty-state__body">Nothing edible was detected in that content. Try a different URL or more descriptive text.</p>
      </div>
    );
  }

  return (
    <div className="mt-12 w-full animate-fade-up">
      <div className="flex items-center justify-between mb-4 px-2">
        <span className="data-label">{results.length} spot{results.length !== 1 ? 's' : ''} detected</span>
        {!isSavedTab && <div className="accent-rule" />}
      </div>
      
      {/* Desktop Table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="data-table">
          <thead>
            <tr>
              <th>Establishment</th>
              <th>Cuisine</th>
              <th>Transit</th>
              <th>Stats</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const isAlreadySaved = !isSavedTab && r.place_id && savedIds.has(r.place_id);
              return (
                <tr key={i} className="hover-lift">
                  <td>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-ink">{r.name}</span>
                        {!r.verified && (
                          <div className="status-dot status-dot--unverified" title="Unverified name" />
                        )}
                        {r.verified && (
                          <div className="status-dot status-dot--verified" title="Google Verified" />
                        )}
                      </div>
                      <span className="mono-text clamp-1 max-w-xs">{r.address}</span>
                    </div>
                  </td>
                  <td>
                    <CuisineBadge cuisine={r.cuisine} />
                  </td>
                  <td>
                    <MRTBadge station={r.nearest_mrt} />
                  </td>
                  <td>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ink" data-numeric>{r.rating || "—"}</span>
                        {r.rating && (
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star key={star} className={`h-2.5 w-2.5 ${star <= Math.round(r.rating) ? 'fill-chili text-chili' : 'text-ink-200'}`} />
                            ))}
                          </div>
                        )}
                      </div>
                      <PriceIndicator level={r.price_level} />
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => window.open(getGoogleMapsUrl(r), '_blank')}
                        className="btn btn-secondary btn-icon"
                        title="View on Maps"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                      {!isSavedTab && (
                        <button 
                          onClick={() => !isAlreadySaved && onSave?.(r)}
                          disabled={!!isAlreadySaved}
                          className={`btn btn-icon ${isAlreadySaved ? 'btn-ghost' : 'btn-primary'}`}
                          title={isAlreadySaved ? "Already saved" : "Save location"}
                        >
                          {isAlreadySaved ? <Bookmark className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {results.map((r, i) => {
          const isAlreadySaved = !isSavedTab && r.place_id && savedIds.has(r.place_id);
          return (
            <div key={i} className="result-card">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                  <span className="font-display text-lg font-bold leading-tight">{r.name}</span>
                  <span className="mono-text text-xs leading-snug">{r.address}</span>
                </div>
                {!isSavedTab && (
                  <button 
                    onClick={() => !isAlreadySaved && onSave?.(r)}
                    disabled={!!isAlreadySaved}
                    className={`btn btn-icon btn-sm ${isAlreadySaved ? 'btn-ghost' : 'btn-primary'}`}
                  >
                    {isAlreadySaved ? <Bookmark className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
                  </button>
                )}
              </div>
              
              <hr />
              
              <div className="flex flex-wrap gap-2">
                <CuisineBadge cuisine={r.cuisine} />
                <MRTBadge station={r.nearest_mrt} />
              </div>

              <div className="flex items-center justify-between mt-1">
                <div className="rating-bar w-24">
                  <div className="rating-bar__track">
                    <div className="rating-bar__fill" style={{ width: `${(r.rating || 0) * 20}%` }} />
                  </div>
                  <span className="font-mono text-2xs">{r.rating || "—"}</span>
                </div>
                <button 
                  onClick={() => window.open(getGoogleMapsUrl(r), '_blank')}
                  className="btn btn-secondary btn-sm"
                >
                  <MapPin className="h-3.5 w-3.5 mr-1" />
                  Maps
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!session) {
    return <Auth />;
  }

  return <FoodDiscoveryPage session={session} />;
}

function FoodDiscoveryPage({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<"discover" | "saved">("discover");
  const [savedPlaces, setSavedPlaces] = useState<PlaceResult[] | null>(null);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [results, setResults]     = useState<PlaceResult[] | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const isUrl = useMemo(() => isTikTokUrl(input), [input]);

  const savedIds = useMemo(
    () => new Set((savedPlaces ?? []).map(p => p.place_id).filter(Boolean) as string[]),
    [savedPlaces]
  );

  async function handleGenerate() {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setLoadingStep(isUrl ? "Fetching TikTok..." : "Parsing text...");

    const controller = new AbortController();
    const timeoutMs = isUrl ? 120_000 : 45_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      if (isUrl) setLoadingStep("Vision AI processing slides...");

      const res = await fetch(`${apiUrl}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text: input }),
        signal: controller.signal, 
      });

      setLoadingStep("Mapping MRT exits...");
      clearTimeout(timeoutId);

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      setResults(data.results ?? []);
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        setError("Request timed out. TikTok video might be too long for the analyzer.");
      } else if (err instanceof Error) {
        setError(err.message.includes("Failed to fetch") ? "Backend server unreachable." : err.message);
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  const fetchSavedPlaces = async () => {
    const { data, error } = await supabase
      .from('saved_places')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      setSavedPlaces([]);
      return;
    }

    if (data) {
      setSavedPlaces(data.map(d => ({
        name: d.name,
        address: d.address || "",
        place_id: d.place_id,
        cuisine: d.cuisine || "Other",
        lat: d.lat,
        lng: d.lng,
        rating: d.rating,
        user_ratings_total: d.user_ratings_total,
        price_level: d.price_level,
        nearest_mrt: d.nearest_mrt || "Unknown",
        verified: true
      })));
    }
  }

  useEffect(() => {
    fetchSavedPlaces();
  }, [activeTab]);

  const handleSavePlace = async (r: PlaceResult) => {
    if (r.place_id && savedIds.has(r.place_id)) return;

    const { error } = await supabase.from('saved_places').insert({
      user_id: session.user.id,
      name: r.name,
      address: r.address,
      place_id: r.place_id,
      cuisine: r.cuisine,
      lat: r.lat,
      lng: r.lng,
      rating: r.rating,
      user_ratings_total: r.user_ratings_total,
      price_level: r.price_level,
      nearest_mrt: r.nearest_mrt,
      tiktok_url: input,
    });

    if (!error) {
      setSavedPlaces(prev => [...(prev ?? []), { ...r }]);
    }
  }

  return (
    <div className="page-shell">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar__wordmark">
          <em>TT</em>Foodie
        </div>
        <div className="flex items-center gap-4">

          <button 
            onClick={() => supabase.auth.signOut()}
            className="btn btn-ghost btn-sm"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="content-container py-12 md:py-20">
        <div className="max-w-panel mx-auto">
          {/* Hero */}
          <div className="mb-12">

            <h1 className="mb-4">From Feed to <span className="underline-accent italic">Table</span>.</h1>
            <p className="max-w-prose">
              Paste a trending TikTok URL to extract hidden food gems, map them to SG's transit lines, and save your next meal.
            </p>
          </div>

          {/* Unified Discovery Panel */}
          <div className="panel-raised p-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <textarea
                  className="field field-url min-h-[5rem] pl-10"
                  placeholder="Paste TikTok URL or content here..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                />
                <Search className="absolute left-3 top-4 h-4 w-4 text-ink-300" />
                
                {input.trim() && (
                  <div className="absolute bottom-3 left-3 flex gap-2">
                    <span className={`badge ${isUrl ? 'badge-accent' : 'badge-neutral'}`}>
                      {isUrl ? <Link className="h-2 w-2 mr-1" /> : <FileText className="h-2 w-2 mr-1" />}
                      {isUrl ? 'TikTok URL' : 'Raw Text'}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={handleGenerate}
                disabled={loading || !input.trim()}
                className={`btn btn-primary sm:w-32 sm:h-auto h-12 ${loading ? 'btn-loading' : ''}`}
              >
                Discover
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="mt-12 flex items-center justify-between border-b-2 border-ink">
            <div className="flex">
              <button
                onClick={() => setActiveTab("discover")}
                className={`px-6 py-3 font-display font-bold text-sm tracking-tight transition-all border-b-4 ${
                  activeTab === "discover" ? "border-chili text-ink" : "border-transparent text-ink-400 hover:text-ink-600"
                }`}
              >
                Inbound Feed
              </button>
              <button
                onClick={() => setActiveTab("saved")}
                className={`px-6 py-3 font-display font-bold text-sm tracking-tight transition-all border-b-4 ${
                  activeTab === "saved" ? "border-chili text-ink" : "border-transparent text-ink-400 hover:text-ink-600"
                }`}
              >
                Saved Library
              </button>
            </div>
            
            {loading && (
              <div className="flex items-center gap-3 animate-fade-in">
                <div className="status-dot status-dot--live" />
                <span className="mono-text text-2xs uppercase">{loadingStep || "Processing..."}</span>
              </div>
            )}
          </div>

          {/* Error Feed */}
          {error && (
            <div className="toast toast--error mt-6 animate-fade-up">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <div>
                <span className="font-bold">Extraction Error:</span> {error}
              </div>
            </div>
          )}

          {/* View Layer */}
          <div className="min-h-[400px]">
            {activeTab === "discover" ? (
              <>
                {loading && !results && (
                  <div className="mt-12 space-y-6">
                    <div className="skeleton skeleton-heading w-1/3" />
                    <div className="space-y-3">
                      <div className="skeleton h-20 w-full" />
                      <div className="skeleton h-20 w-full" />
                      <div className="skeleton h-20 w-full" />
                    </div>
                  </div>
                )}
                {!loading && results !== null && (
                  <ResultsTable 
                    results={results} 
                    onSave={handleSavePlace} 
                    savedIds={savedIds} 
                  />
                )}
              </>
            ) : (
              /* Saved Tab */
              <div className="w-full">
                {!savedPlaces ? (
                  <div className="mt-12 space-y-3">
                    <div className="skeleton h-16 w-full" />
                    <div className="skeleton h-16 w-full" />
                  </div>
                ) : savedPlaces.length === 0 ? (
                  <div className="empty-state mt-16">
                    <Bookmark className="empty-state__icon opacity-20" />
                    <h3 className="empty-state__title">Library empty</h3>
                    <p className="empty-state__body">You haven't archived any spots yet. Discover them from your feed first.</p>
                  </div>
                ) : (
                  <ResultsTable results={savedPlaces} isSavedTab={true} />
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-ink-200 py-12">
        <div className="content-container flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="topbar__wordmark opacity-50">
            <em>TT</em>Foodie
          </div>
          <div className="flex gap-8">
            <span className="data-label">Singapore Protocol</span>
            <span className="data-label">© 2024 TTF.STUDIO</span>
          </div>
        </div>
      </footer>
    </div>
  );
}