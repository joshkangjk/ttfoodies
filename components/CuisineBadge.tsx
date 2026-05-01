"use client";

export function CuisineBadge({ cuisine }: { cuisine: string }) {
  const cls = cuisine === "Other" || cuisine === "Unknown" ? "badge-neutral" : "badge-accent";
  return (
    <span className={`badge ${cls}`}>
      {cuisine}
    </span>
  );
}
