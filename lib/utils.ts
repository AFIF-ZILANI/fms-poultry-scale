export function formatWeight(kg: number): string {
  return kg.toFixed(2);
}

// Bird count can be unknown (null) when pcs tracking is skipped or not yet
// entered — show the localized "unknown" label instead of a misleading number.
export function formatPcs(
  pcs: number | null | undefined,
  unknownLabel: string
): string {
  return pcs == null ? unknownLabel : String(pcs);
}

// Sum bird counts, treating unknown (null) entries as 0.
export function sumPcs(rows: { pcs: number | null }[]): number {
  return rows.reduce((s, r) => s + (r.pcs ?? 0), 0);
}

export function kgToGrams(kg: number): number {
  return Math.round(kg * 1000);
}

export function formatGrams(grams: number): string {
  return grams.toLocaleString();
}

export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = Math.floor((now - timestamp) / 1000);

  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins}m ago`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(diff / 86400);
  return `${days}d ago`;
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return `${month} ${day}, ${year} at ${h}:${minutes} ${ampm}`;
}
