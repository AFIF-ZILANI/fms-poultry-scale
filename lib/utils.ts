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

export interface RelTimeStrings {
  justNow: string;
  secsAgo: (n: number) => string;
  minsAgo: (n: number) => string;
  hoursAgo: (n: number) => string;
  daysAgo: (n: number) => string;
}

const defaultRelTime: RelTimeStrings = {
  justNow: "just now",
  secsAgo: (n) => `${n}s ago`,
  minsAgo: (n) => `${n}m ago`,
  hoursAgo: (n) => `${n}h ago`,
  daysAgo: (n) => `${n}d ago`,
};

export function getRelativeTime(timestamp: number, s?: RelTimeStrings): string {
  const { justNow, secsAgo, minsAgo, hoursAgo, daysAgo } = s ?? defaultRelTime;
  const diff = Math.floor((Date.now() - timestamp) / 1000);

  if (diff < 5) return justNow;
  if (diff < 60) return secsAgo(diff);
  if (diff < 3600) return minsAgo(Math.floor(diff / 60));
  if (diff < 86400) return hoursAgo(Math.floor(diff / 3600));
  return daysAgo(Math.floor(diff / 86400));
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
