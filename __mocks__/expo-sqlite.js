// Jest automock for expo-sqlite, backed by Node's built-in SQLite.
// Lets the DB layer be tested against a real engine (real FKs, real cascades,
// real upserts) instead of a hand-written fake. No extra dependency.
const { DatabaseSync } = require("node:sqlite");

const isQuery = (sql) =>
  /^\s*(select|pragma|with)\b/i.test(sql) || /\breturning\b/i.test(sql);

// node:sqlite only binds null/number/bigint/string/Uint8Array.
const toBindable = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  return v;
};

function wrap(db) {
  return {
    execSync: (sql) => db.exec(sql),
    closeSync: () => db.close(),
    prepareSync(sql) {
      const stmt = db.prepare(sql);
      const bind = (params = []) => params.map(toBindable);

      return {
        executeSync(params = []) {
          const args = bind(params);
          if (isQuery(sql)) {
            stmt.setReturnArrays(false);
            const rows = stmt.all(...args);
            return {
              getAllSync: () => rows,
              getFirstSync: () => rows[0] ?? null,
              changes: 0,
              lastInsertRowId: 0,
            };
          }
          const r = stmt.run(...args);
          return {
            getAllSync: () => [],
            getFirstSync: () => null,
            changes: Number(r.changes),
            lastInsertRowId: Number(r.lastInsertRowid),
          };
        },
        // Relational queries (db.query.*) read positional rows.
        executeForRawResultSync(params = []) {
          stmt.setReturnArrays(true);
          let rows;
          try {
            rows = stmt.all(...bind(params)); // materialize before resetting
          } finally {
            stmt.setReturnArrays(false);
          }
          return { getAllSync: () => rows };
        },
        finalizeSync() {},
      };
    },
  };
}

module.exports = {
  openDatabaseSync: () => wrap(new DatabaseSync(":memory:")),
};
