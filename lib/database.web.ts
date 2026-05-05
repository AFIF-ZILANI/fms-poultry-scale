import AsyncStorage from "@react-native-async-storage/async-storage";

interface FakeDB {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, params?: unknown[]) => Promise<void>;
  getAllAsync: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  getFirstAsync: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
}

type TableName = "sales" | "prefs" | "drafts";

const TABLES: TableName[] = ["sales", "prefs", "drafts"];

interface Row {
  [key: string]: unknown;
}

const cache: { [table in TableName]?: Row[] } = {};
let loadedTables = new Set<TableName>();

async function loadTable(table: TableName): Promise<Row[]> {
  if (loadedTables.has(table)) return cache[table] ?? [];
  loadedTables.add(table);
  try {
    const json = await AsyncStorage.getItem(`@webdb:${table}`);
    cache[table] = json ? JSON.parse(json) : [];
  } catch {
    cache[table] = [];
  }
  return cache[table] ?? [];
}

async function saveTable(table: TableName): Promise<void> {
  await AsyncStorage.setItem(`@webdb:${table}`, JSON.stringify(cache[table] ?? []));
}

function tableFromSQL(sql: string): TableName {
  const m = sql.match(/(?:FROM|INTO|UPDATE|TABLE)\s+(\w+)/i);
  const name = (m?.[1] ?? "").toLowerCase();
  return TABLES.includes(name as TableName) ? (name as TableName) : "sales";
}

function opFromSQL(sql: string): string {
  const s = sql.trim().toUpperCase();
  if (s.startsWith("INSERT OR REPLACE")) return "UPSERT";
  if (s.startsWith("INSERT")) return "INSERT";
  if (s.startsWith("UPDATE")) return "UPDATE";
  if (s.startsWith("DELETE")) return "DELETE";
  if (s.startsWith("SELECT")) return "SELECT";
  return "OTHER";
}

let dbPromise: Promise<FakeDB> | null = null;

export function getDb(): Promise<FakeDB> {
  if (!dbPromise) {
    dbPromise = Promise.resolve(createFakeDb());
  }
  return dbPromise;
}

function createFakeDb(): FakeDB {
  return {
    execAsync: async () => {},

    runAsync: async (sql: string, params: unknown[] = []) => {
      const table = tableFromSQL(sql);
      const op = opFromSQL(sql);
      await loadTable(table);
      const rows = cache[table] ?? [];

      if (op === "UPSERT") {
        if (table === "prefs") {
          const [key, value] = params as [string, string];
          const idx = rows.findIndex((r) => r["key"] === key);
          const row = { key, value };
          if (idx >= 0) rows[idx] = row;
          else rows.push(row);
        } else if (table === "sales") {
          const [id, data, created_at] = params as [string, string, number];
          const idx = rows.findIndex((r) => r["id"] === id);
          const row = { id, data, created_at };
          if (idx >= 0) rows[idx] = row;
          else rows.push(row);
        } else if (table === "drafts") {
          const [id, data, updated_at] = params as [string, string, number];
          const idx = rows.findIndex((r) => r["id"] === id);
          const row = { id, data, updated_at };
          if (idx >= 0) rows[idx] = row;
          else rows.push(row);
        }
        cache[table] = rows;
        await saveTable(table);
      } else if (op === "DELETE") {
        const val = params[0] as string;
        const key = table === "prefs" ? "key" : "id";
        cache[table] = rows.filter((r) => r[key] !== val);
        await saveTable(table);
      } else if (op === "UPDATE") {
        const [data, id] = params as [string, string];
        const idx = rows.findIndex((r) => r["id"] === id);
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], data };
          cache[table] = rows;
          await saveTable(table);
        }
      }
    },

    getAllAsync: async <T>(sql: string): Promise<T[]> => {
      const table = tableFromSQL(sql);
      await loadTable(table);
      const rows = [...(cache[table] ?? [])];

      if (table === "sales") {
        rows.sort((a, b) => ((b["created_at"] as number) ?? 0) - ((a["created_at"] as number) ?? 0));
        return rows.map((r) => ({ data: r["data"] })) as T[];
      }
      if (table === "drafts") {
        rows.sort((a, b) => ((b["updated_at"] as number) ?? 0) - ((a["updated_at"] as number) ?? 0));
        return rows.map((r) => ({ data: r["data"] })) as T[];
      }
      return rows as T[];
    },

    getFirstAsync: async <T>(sql: string, params: unknown[] = []): Promise<T | null> => {
      const table = tableFromSQL(sql);
      await loadTable(table);
      const rows = cache[table] ?? [];
      const val = params[0] as string;

      if (table === "prefs") {
        const row = rows.find((r) => r["key"] === val);
        return row ? ({ value: row["value"] } as T) : null;
      }
      const row = rows.find((r) => r["id"] === val);
      return row ? ({ data: row["data"] } as T) : null;
    },
  };
}
