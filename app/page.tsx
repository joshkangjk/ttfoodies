"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Link, FileText, BookmarkPlus, Bookmark, LogOut, RotateCcw, Sparkles, AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import Auth from "../components/Auth";
import type { Session } from "@supabase/supabase-js";
import { PlaceResult } from "./types";
import { ResultsTable } from "../components/ResultsTable";

// ── TikTok URL detection (mirrors backend logic) ───────────────────────────────

const TIKTOK_PATTERN = /https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/\S+/i;

function isTikTokUrl(text: string): boolean {
  return TIKTOK_PATTERN.test(text.trim());
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

  // ── Handle Shared URL (Phase 2 — Server-Side Bridge) ───────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkSharedUrl = async () => {
      // 1. Still check URL params (works when opened via https://)
      const params = new URLSearchParams(window.location.search);
      let sharedUrl = params.get("url");
      if (!sharedUrl && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        sharedUrl = hashParams.get("url");
      }

      if (sharedUrl && isTikTokUrl(sharedUrl)) {
        setInput(sharedUrl);
        window.history.replaceState({}, "", window.location.pathname);
        handleGenerate(sharedUrl);
        return;
      }

      // 2. Poll the server-side share inbox (works when opened via webapp://)
      if (session?.user?.id) {
        try {
          const res = await fetch(`/api/share?user_id=${session.user.id}`);
          const data = await res.json();
          if (data.url && isTikTokUrl(data.url)) {
            setInput(data.url);
            handleGenerate(data.url);
          }
        } catch (e) {
          // Silently fail — not critical
        }
      }
    };

    checkSharedUrl();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkSharedUrl();
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", checkSharedUrl);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", checkSharedUrl);
    };
  }, [session]);

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
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[100] animate-fade-up">
          <div className="toast toast--success">
            {toastMessage}
          </div>
        </div>
      )}

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
          <div className="mb-12">
            <h1 className="mb-4">From Feed to <span className="underline-accent italic">Table</span>.</h1>
            <p className="max-w-prose">
              Paste a trending TikTok URL to extract hidden food gems, map them to SG's transit lines, and save your next meal.
            </p>
          </div>

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

          {error && (
            <div className="toast toast--error mt-6 animate-fade-up">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <div>
                <span className="font-bold">Extraction Error:</span> {error}
              </div>
            </div>
          )}

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
                        </button>
                      ))}
                    </div>

                    <ResultsTable
                      results={savedPlaces.filter(p => p.cuisine === selectedCuisine || selectedCuisine === "All")}
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
    </div>
  );
}
