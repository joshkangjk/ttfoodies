"use client";

import { useState, useEffect } from "react";
import { MapPin, Star, ExternalLink, X, Trash2, Bookmark, BookmarkPlus, AlertCircle } from "lucide-react";
import { PlaceResult } from "../app/types";
import { CuisineBadge } from "./CuisineBadge";
import { MRTBadge } from "./MRTBadge";

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

interface ResultsTableProps {
  results: PlaceResult[];
  onSave?: (r: PlaceResult) => void;
  onDelete?: (r: PlaceResult) => void;
  savedIds?: Set<string>;
  isSavedTab?: boolean;
  headerActions?: React.ReactNode;
}

export function ResultsTable({
  results,
  onSave,
  onDelete,
  savedIds = new Set(),
  isSavedTab = false,
  headerActions
}: ResultsTableProps) {
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
