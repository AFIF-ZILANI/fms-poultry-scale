// Parent-first: a remote row is never upserted before the row it references.
// Flush deletes walk this list in reverse (child-first) for the same reason.
export const SYNCED_TABLES = [
  "users",
  "user_prefs",
  "batches",
  "sales",
  "sale_meta_data",
  "measurement_rows",
  "row_edit_history",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

// The remote (and local SQL) primary key column for each table — differs
// from "id" for the two tables whose PK is a foreign key (see db/schema.ts).
// Splits a list into fixed-size groups so one flush/restore of a big sale
// can't put a few thousand ids into a single request (PostgREST puts `.in()`
// lists in the URL — long ones come back as a 414).
export function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const PK_COLUMN: Record<SyncedTable, string> = {
  users: "id",
  user_prefs: "user_id",
  batches: "id",
  sales: "id",
  sale_meta_data: "sale_id",
  measurement_rows: "id",
  row_edit_history: "id",
};
