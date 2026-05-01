"use client";

export function MRTBadge({ station }: { station: string }) {
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
