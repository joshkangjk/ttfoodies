"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Loader2, MapPin, Utensils, Train, AlertCircle, Link, FileText, Star, DollarSign, BookmarkPlus, Bookmark, LogOut, ArrowRight, ExternalLink, X, Trash2, RotateCcw, Check, Sparkles } from "lucide-react";
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

  // Extract line prefix (e.g., "DT" from "DT18")
  const prefix = station.match(/^[A-Z]+/)?.[0]?.toUpperCase() || "";
  
  const lineClass = {
    'NS': 'mrt--nsl',
    'EW': 'mrt--ewl',
    'NE': 'mrt--nel',
    'CC': 'mrt--ccl',
    'DT': 'mrt--dtl',
    'TE': 'mrt--tel',
    'LRT': 'mrt--lrt',
    'BP': 'mrt--lrt',
    'STC': 'mrt--lrt',
    'PTC': 'mrt--lrt',
  }[prefix] || "";

  return (
    <span className={`mrt-badge ${lineClass}`}>
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

// ── Results Table (Card Grid + Modal) ─────────────────────────────────────────

function ResultsTable({
  results,
  onSave,
  onDelete,
  savedIds = new Set(),
  isSavedTab = false,
  headerActions
}: {
  results: PlaceResult[],
  onSave?: (r: PlaceResult) => void,
  onDelete?: (r: PlaceResult) => void,
  savedIds?: Set<string>,
  isSavedTab?: boolean,
  headerActions?: React.ReactNode
}) {
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedPlace(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (selectedPlace) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [selectedPlace]);

  if (results.length === 0) {
    return (
      <div className="empty-state mt-16">
        <AlertCircle className="empty-state__icon" />
        <h3 className="empty-state__title">No discoveries found</h3>
        <p className="empty-state__body">Nothing edible was detected in that content. Try a different URL or more descriptive text.</p>
      </div>
    );
  }

  const isSaved = (r: PlaceResult) => !isSavedTab && !!r.place_id && savedIds.has(r.place_id);

  return (
    <>
      <div className="mt-12 w-full">
        <div className="animate-fade-up">
          <div className="flex items-center justify-between mb-6 px-2">
            <div className="flex items-center gap-4">
              <span className="data-label">{results.length} spot{results.length !== 1 ? 's' : ''} detected</span>
              {!isSavedTab && <div className="accent-rule" />}
            </div>
            {headerActions}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => setSelectedPlace(r)}
                className="result-card hover-lift text-left w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-chili transition-all"
                aria-haspopup="dialog"
                aria-label={`View details for ${r.name}`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="font-display font-bold text-base leading-tight text-ink line-clamp-2">
                    {r.name}
                  </span>
                  <div
                    className={`status-dot flex-shrink-0 mt-1 ${r.verified ? 'status-dot--verified' : 'status-dot--unverified'}`}
                    title={r.verified ? "Google Verified" : "Unverified"}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <CuisineBadge cuisine={r.cuisine} />
                  <MRTBadge station={r.nearest_mrt} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedPlace && (() => {
        const r = selectedPlace;
        const saved = isSaved(r);
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Details for ${r.name}`}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
            onClick={() => setSelectedPlace(null)}
          >
            <div className="absolute inset-0 bg-ink/40 backdrop-blur-md animate-fade-in" />
            <div
              className="relative z-10 w-full max-w-lg modal-surface overflow-hidden animate-fade-up flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-ink p-6 text-paper relative">
                <button
                  onClick={() => setSelectedPlace(null)}
                  className="absolute top-4 right-4 text-ink-300 hover:text-paper transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
                
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="font-display font-bold text-2xl leading-tight text-paper uppercase tracking-tight">
                    {r.name}
                  </h2>
                  <div
                    className={`status-dot h-2.5 w-2.5 ${r.verified ? 'bg-success' : 'bg-ink-400'}`}
                    title={r.verified ? "Verified via Google" : "Unverified"}
                  />
                </div>
                <div className="flex items-center gap-2 opacity-80">
                  <MapPin className="h-3.5 w-3.5" />
                  <p className="mono-text text-xs text-paper font-medium">
                    {r.address || "Location in Singapore"}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-surface">
                <div className="aspect-video bg-ink-50 border border-ink-200 flex items-center justify-center relative overflow-hidden group">
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                  <div className="text-center z-10">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ink-100 text-ink-400 mb-2">
                      <MapPin className="h-6 w-6" />
                    </div>
                    <p className="data-label text-[10px]">Geospatial coordinates verified</p>
                    <p className="mono-text text-[10px] mt-1 opacity-50">{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div>
                      <span className="data-label block mb-2">Cuisine Profile</span>
                      <CuisineBadge cuisine={r.cuisine} />
                    </div>
                    <div>
                      <span className="data-label block mb-2">Transit Access</span>
                      <MRTBadge station={r.nearest_mrt} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <span className="data-label block mb-2">Taste Rating</span>
                      <div className="flex items-baseline gap-2">
                        <span className="font-display font-black text-3xl leading-none text-ink">{r.rating ?? "—"}</span>
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star
                              key={star}
                              className={`h-3 w-3 ${star <= Math.round(r.rating || 0) ? 'fill-chili text-chili' : 'text-ink-200'}`}
                            />
                          ))}
                        </div>
                      </div>
                      {r.user_ratings_total && (
                        <p className="mono-text text-[10px] mt-1 opacity-40 uppercase tracking-widest">Based on {r.user_ratings_total} reviews</p>
                      )}
                    </div>
                    <div>
                      <span className="data-label block mb-2">Budget Bracket</span>
                      <div className="flex items-center gap-3">
                        <PriceIndicator level={r.price_level} />
                        <span className="mono-text text-xs text-ink-600 font-bold">
                          {formatPricePax(r.price_level)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-ink-50 border-t border-ink-200 flex items-center justify-between gap-3">
                <button
                  onClick={() => window.open(getGoogleMapsUrl(r), '_blank')}
                  className="btn btn-secondary flex-1"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Navigation
                </button>

                {isSavedTab ? (
                  <button
                    onClick={() => { onDelete?.(r); setSelectedPlace(null); }}
                    className="btn btn-ghost text-error flex-1 hover:bg-error/5"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove
                  </button>
                ) : (
                  <button
                    onClick={() => { if (!saved) onSave?.(r); }}
                    disabled={!!saved}
                    className={`btn flex-1 ${saved ? 'btn-ghost' : 'btn-primary'}`}
                  >
                    {saved
                      ? <><Bookmark className="h-4 w-4 mr-2" />Archived</>
                      : <><BookmarkPlus className="h-4 w-4 mr-2" />Save Discovery</>
                    }
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
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
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedCuisine, setSelectedCuisine] = useState<string>("All");

  const isUrl = useMemo(() => isTikTokUrl(input), [input]);

  const savedIds = useMemo(
    () => new Set((savedPlaces ?? []).map(p => p.place_id).filter(Boolean) as string[]),
    [savedPlaces]
  );

  const cuisineList = useMemo(() => {
    if (!savedPlaces) return ["All"];
    const cuisines = Array.from(new Set(savedPlaces.map(p => p.cuisine)));
    return ["All", ...cuisines.sort()];
  }, [savedPlaces]);

  const filteredSavedPlaces = useMemo(() => {
    if (!savedPlaces) return null;
    if (selectedCuisine === "All") return savedPlaces;
    return savedPlaces.filter(p => p.cuisine === selectedCuisine);
  }, [savedPlaces, selectedCuisine]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  const clearFeed = () => {
    setResults(null);
    setInput("");
    setError(null);
  };

  async function handleGenerate(textOverride?: string) {
    const textToProcess = textOverride || input;
    if (!textToProcess.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);

    const isShared = isTikTokUrl(textToProcess);
    setLoadingStep(isShared ? "Fetching TikTok..." : "Parsing text...");

    const controller = new AbortController();
    const timeoutMs = isShared ? 120_000 : 45_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      if (isShared) setLoadingStep("Vision AI processing slides...");

      const res = await fetch(`${apiUrl}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text: textToProcess }),
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

  // ── Handle Shared URL (Phase 2) ───────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sharedUrl = params.get("url");
      if (sharedUrl && isTikTokUrl(sharedUrl)) {
        setInput(sharedUrl);
        // Clear param so it doesn't re-trigger on refresh
        window.history.replaceState({}, "", window.location.pathname);
        // Immediately trigger processing using the override
        handleGenerate(sharedUrl);
      }
    }
  }, []);

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
      showToast(`✓ ${r.name} saved to Library`);
    }
  }

  const handleSaveAll = async () => {
    if (!results) return;
    const unsaved = results.filter(r => r.verified && r.place_id && !savedIds.has(r.place_id));
    if (unsaved.length === 0) return;

    setLoading(true);
    setLoadingStep(`Archiving ${unsaved.length} spots...`);

    let successCount = 0;
    for (const r of unsaved) {
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
      if (!error) successCount++;
    }

    await fetchSavedPlaces();
    setLoading(false);
    setLoadingStep("");
    showToast(`✓ Bulk saved ${successCount} discoveries`);
  }

  const handleDeletePlace = async (r: PlaceResult) => {
    if (!r.place_id) return;
    const { error } = await supabase
      .from('saved_places')
      .delete()
      .eq('place_id', r.place_id)
      .eq('user_id', session.user.id);

    if (!error) {
      setSavedPlaces(prev => prev ? prev.filter(p => p.place_id !== r.place_id) : null);
      showToast(`Removed ${r.name}`);
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
                onClick={() => handleGenerate()}
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
                className={`flex items-center px-6 py-3 font-display font-bold text-sm tracking-tight transition-all border-b-4 ${activeTab === "discover" ? "border-chili text-ink active" : "border-transparent text-ink-400 hover:text-ink-600"
                  }`}
              >
                Inbound Feed
                {results && results.length > 0 && (
                  <span className="count-pip">{results.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("saved")}
                className={`flex items-center px-6 py-3 font-display font-bold text-sm tracking-tight transition-all border-b-4 ${activeTab === "saved" ? "border-chili text-ink active" : "border-transparent text-ink-400 hover:text-ink-600"
                  }`}
              >
                Saved Library
                {savedPlaces && savedPlaces.length > 0 && (
                  <span className="count-pip">{savedPlaces.length}</span>
                )}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="skeleton h-24 w-full" />
                      <div className="skeleton h-24 w-full" />
                      <div className="skeleton h-24 w-full" />
                    </div>
                  </div>
                )}
                {!loading && results === null && (
                  <div className="mt-12 animate-fade-up">
                    <div className="onboarding-card">
                      <Sparkles className="h-8 w-8 text-chili mx-auto mb-4 opacity-50" />
                      <h3 className="font-display text-xl mb-6">Discover Singapore's hidden gems</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
                        <div className="space-y-2">
                          <span className="badge badge-ink">Step 1</span>
                          <p className="text-sm font-medium">Find a viral food TikTok or transcript</p>
                        </div>
                        <div className="space-y-2">
                          <span className="badge badge-ink">Step 2</span>
                          <p className="text-sm font-medium">Paste the link and hit <span className="text-chili">Discover</span></p>
                        </div>
                        <div className="space-y-2">
                          <span className="badge badge-ink">Step 3</span>
                          <p className="text-sm font-medium">Save verified spots to your Library</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {!loading && results !== null && (
                  <ResultsTable
                    results={results}
                    onSave={handleSavePlace}
                    savedIds={savedIds}
                    headerActions={
                      <div className="flex gap-2">
                        {results.length > 0 && (
                          <button
                            onClick={handleSaveAll}
                            disabled={!results.some(r => r.verified && r.place_id && !savedIds.has(r.place_id))}
                            className="btn btn-secondary btn-sm"
                          >
                            <BookmarkPlus className="h-3.5 w-3.5 mr-2" />
                            Save All
                          </button>
                        )}
                        <button onClick={clearFeed} className="btn btn-ghost btn-sm">
                          <RotateCcw className="h-3.5 w-3.5 mr-2" />
                          Clear
                        </button>
                      </div>
                    }
                  />
                )}
              </>
            ) : (
              /* Saved Tab */
              <div className="w-full">
                {!savedPlaces ? (
                  <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="skeleton h-24 w-full" />
                    <div className="skeleton h-24 w-full" />
                    <div className="skeleton h-24 w-full" />
                  </div>
                ) : savedPlaces.length === 0 ? (
                  <div className="empty-state mt-16">
                    <Bookmark className="empty-state__icon opacity-20" />
                    <h3 className="empty-state__title">Library empty</h3>
                    <p className="empty-state__body">You haven't archived any spots yet. Discover them from your feed first.</p>
                  </div>
                ) : (
                  <div className="mt-8 space-y-8">
                    <div className="filter-scroll">
                      {cuisineList.map(c => (
                        <button
                          key={c}
                          onClick={() => setSelectedCuisine(c)}
                          className={`cuisine-pill whitespace-nowrap ${selectedCuisine === c ? 'cuisine-pill--active' : ''}`}
                        >
                          {c}
                          {savedPlaces.filter(p => p.cuisine === c || c === "All").length > 0 && (
                             <span className="ml-1.5 opacity-60 text-[10px]">
                               {c === "All" ? savedPlaces.length : savedPlaces.filter(p => p.cuisine === c).length}
                             </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <ResultsTable
                      results={filteredSavedPlaces || []}
                      isSavedTab={true}
                      onDelete={handleDeletePlace}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Floating Toast */}
      {toastMessage && (
        <div className="toast-float animate-fade-up">
          <div className="toast toast--success shadow-crisp">
            <Check className="h-4 w-4 mt-0.5" />
            <span className="font-bold">{toastMessage}</span>
          </div>
        </div>
      )}

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
