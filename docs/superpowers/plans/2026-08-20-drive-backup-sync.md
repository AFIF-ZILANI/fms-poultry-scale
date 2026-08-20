# Google Drive Backup & Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the merged Supabase raw-mirror backup engine with a per-user Google Drive backup/restore, for every subscription plan.

**Architecture:** The existing `data_backup_queue` table + triggers (unchanged) signal "a backup is due." A Drive sync flush, on trigger, runs `VACUUM INTO` for a consistent snapshot, fetches a short-lived Drive access token from a Supabase Edge Function (Clerk's token API is backend-only), uploads/replaces one file in the user's hidden Drive `appDataFolder`, and clears the queue on success. Restore, on a fresh install with an existing Drive backup, prompts the user before downloading and replacing the local database.

**Tech Stack:** Expo, expo-sqlite/drizzle-orm (unchanged), expo-file-system (new), Supabase Edge Functions (Deno), Clerk (`@clerk/expo`), Jest + `node:sqlite`/real-fs-backed mocks (existing test harness, extended).

**Spec:** `docs/superpowers/specs/2026-08-20-drive-backup-sync-design.md`

## Global Constraints

- Every user backs up to their own Google Drive, regardless of subscription plan (`community` or `premium`) — this feature does not check `subscriptionPlan` at all.
- Drive scope: `https://www.googleapis.com/auth/drive.appdata` — files live in the hidden `appDataFolder`, never in the user's visible Drive.
- Offline-first: a failed backup attempt must leave `data_backup_queue` untouched, so it retries on the next trigger. No network-state detection needed — the existing periodic/background/manual triggers are the retry mechanism.
- Restore requires explicit user confirmation before replacing the local database — never silent.
- No secret (Clerk's secret key) ever ships to the client. The Supabase Edge Function is the only place it's used.
- Reuse `data_backup_queue`, its 21 triggers, and migrations `0011`–`0013` exactly as they are — do not modify them in this plan.
- `supabase/backup_mirror.sql`, `lib/backupSync/flush.ts`, `lib/backupSync/restore.ts`, `lib/backupSync/schedule.ts`, and `lib/backupSync/tables.ts` are removed as part of this plan, not kept running alongside the new engine.
- Match existing code conventions: explicit functions over generic abstractions, `db.$client.execSync` for raw SQL (see `db/client.ts`, `__tests__/helpers/db.ts`), fake/injectable network clients for tests rather than mocking whole SDKs.

---

### Task 1: `expo-file-system` dependency + test mock — DONE, confirmed API below

**Confirmed against the actually-installed package (expo-file-system v19.0.24, Expo SDK 54):** the top-level `expo-file-system` export is the newer class-based `File`/`Directory`/`Paths` API. The legacy free-function API this plan uses (`documentDirectory`, `readAsStringAsync`, `writeAsStringAsync`, `deleteAsync`, `getInfoAsync`, `downloadAsync`, `EncodingType`) lives at the **subpath** `expo-file-system/legacy` — always import from there, never bare `expo-file-system`, in Tasks 4 and 5.

This has a second consequence beyond the import path: Jest resolves a manual mock by matching the exact module specifier requested. A mock at `__mocks__/expo-file-system.js` mocks `require("expo-file-system")` — it does **not** get picked up for `require("expo-file-system/legacy")`. Verified directly: with the mock at the top-level path, a test importing `expo-file-system/legacy` fell through to Jest trying to load and transform the *real* `expo-file-system/legacy.ts` (raw ESM `export * from './src/legacy'`, outside this project's `transformIgnorePatterns` allow-list) and failed with `SyntaxError: Unexpected token 'export'`. Moving the mock to `__mocks__/expo-file-system/legacy.js` (matching Jest's subpath-mock convention) fixed it — confirmed passing.

**Files (as actually delivered):**
- Modified: `package.json` (added dependency)
- Created: `__mocks__/expo-file-system/legacy.js` (not `__mocks__/expo-file-system.js` — see above)

**Interfaces:**
- Produces: a Jest-automocked `expo-file-system/legacy`, backed by Node's real `fs`/`os` modules: `documentDirectory`, `EncodingType`, `readAsStringAsync`, `writeAsStringAsync`, `deleteAsync`, `getInfoAsync`, `downloadAsync` (throws unless spied per-test).

This repo already has one precedent for this exact pattern: `__mocks__/expo-sqlite.js` wraps Node's real `node:sqlite` "to test the DB layer against a real engine... instead of a hand-written fake." The same philosophy applies here — the mock is backed by Node's real `fs` module, not an in-memory fake, so file read/write/exists behavior in tests matches reality.

- [x] **Step 1: Install the dependency and confirm its actual API** — done; see the confirmed-API note above.

- [x] **Step 2: Write the mock** — done, at `__mocks__/expo-file-system/legacy.js` (not the top-level path — see above). For reference, the delivered mock's shape:

```js
// Jest automock for expo-file-system, backed by Node's real fs module —
// same philosophy as __mocks__/expo-sqlite.js: test against real file I/O,
// not a hand-written fake.
const fs = require("fs");
const os = require("os");
const path = require("path");

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "poultry-scale-fs-"));

function toPath(uri) {
  return uri.startsWith("file://") ? uri.slice("file://".length) : uri;
}

module.exports = {
  documentDirectory: `file://${testDir}/`,
  EncodingType: { Base64: "base64", UTF8: "utf8" },
  readAsStringAsync: async (uri, opts) =>
    fs.readFileSync(toPath(uri), { encoding: opts?.encoding ?? "utf8" }),
  writeAsStringAsync: async (uri, content, opts) =>
    fs.writeFileSync(toPath(uri), content, { encoding: opts?.encoding ?? "utf8" }),
  deleteAsync: async (uri) => {
    const p = toPath(uri);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  },
  getInfoAsync: async (uri) => {
    const p = toPath(uri);
    const exists = fs.existsSync(p);
    return { exists, uri, ...(exists ? { size: fs.statSync(p).size } : {}) };
  },
  // Real downloads need a real network call — tests always jest.spyOn this
  // and provide a fake implementation rather than relying on this default,
  // which exists only so an unmocked call fails loudly instead of quietly
  // trying to hit the real network from a test.
  downloadAsync: async () => {
    throw new Error("expo-file-system mock: downloadAsync must be mocked per-test, it has no real network access");
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json __mocks__/expo-file-system/legacy.js
git commit -m "$(cat <<'EOF'
chore(backup): add expo-file-system + its test mock

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Drive REST API wrapper

**Files:**
- Create: `lib/driveSync/driveApi.ts`
- Test: `__tests__/driveApi.test.ts`

**Interfaces:**
- Produces:
  - `findBackupFile(accessToken: string): Promise<string | null>` — returns the existing backup file's id, or `null` if none exists yet.
  - `createBackupFile(accessToken: string, base64Content: string): Promise<string>` — creates the file in `appDataFolder`, returns its new id.
  - `updateBackupFile(accessToken: string, fileId: string, base64Content: string): Promise<void>` — replaces an existing file's content.
  - `driveDownloadUrl(fileId: string): string` — builds the direct-download URL for a file id. A pure function, no network call — Task 5 passes this URL to `expo-file-system`'s `downloadAsync`, which streams the response straight to a file. This file deliberately does NOT implement the download itself: the backup file is arbitrary binary data (a SQLite database), and `fetch().text()` would corrupt it — invalid UTF-8 byte sequences in binary content get silently replaced with U+FFFD on decode. `downloadAsync` avoids ever bringing binary bytes into JS-side string form.
  - `DRIVE_BACKUP_FILENAME` constant, exported for Tasks 4/5 to reference in tests/assertions if needed: `"poultry-scale-backup.db"`.

The three network functions here use the global `fetch` (available in this repo's Jest `node` environment and in React Native) — no HTTP client dependency needed. Tests stub `global.fetch` directly; no dependency injection layer required. All three deal only in JSON request/response bodies (search results, small metadata) or base64-encoded text the caller already prepared — never raw binary, so `fetch`/`res.text()`/`res.json()` are safe here.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/driveApi.test.ts`:

```ts
import {
  findBackupFile,
  createBackupFile,
  updateBackupFile,
  driveDownloadUrl,
  DRIVE_BACKUP_FILENAME,
} from "../lib/driveSync/driveApi";

function mockFetchOnce(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
});

describe("findBackupFile", () => {
  it("returns the file id when a backup already exists", async () => {
    mockFetchOnce(200, { files: [{ id: "file-123", name: DRIVE_BACKUP_FILENAME }] });
    expect(await findBackupFile("token")).toBe("file-123");

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("spaces=appDataFolder");
    expect(url).toContain(encodeURIComponent(DRIVE_BACKUP_FILENAME));
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer token");
  });

  it("returns null when no backup file exists yet", async () => {
    mockFetchOnce(200, { files: [] });
    expect(await findBackupFile("token")).toBeNull();
  });

  it("throws with the response status on an API error", async () => {
    mockFetchOnce(401, { error: { message: "invalid token" } });
    await expect(findBackupFile("token")).rejects.toThrow(/401/);
  });
});

describe("createBackupFile", () => {
  it("posts a multipart request and returns the new file id", async () => {
    mockFetchOnce(200, { id: "new-file-id" });
    const id = await createBackupFile("token", "base64content");
    expect(id).toBe("new-file-id");

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("uploadType=multipart");
    expect(opts.method).toBe("POST");
    expect(String(opts.body)).toContain("appDataFolder");
    expect(String(opts.body)).toContain("base64content");
  });
});

describe("updateBackupFile", () => {
  it("patches the existing file's content", async () => {
    mockFetchOnce(200, { id: "file-123" });
    await updateBackupFile("token", "file-123", "newbase64");

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("file-123");
    expect(url).toContain("uploadType=multipart");
    expect(opts.method).toBe("PATCH");
    expect(String(opts.body)).toContain("newbase64");
  });
});

describe("driveDownloadUrl", () => {
  it("builds a direct-download URL for the given file id, no network call", () => {
    const url = driveDownloadUrl("file-123");
    expect(url).toContain("file-123");
    expect(url).toContain("alt=media");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/driveApi.test.ts -v`
Expected: FAIL — `Cannot find module '../lib/driveSync/driveApi'`.

- [ ] **Step 3: Write the implementation**

Create `lib/driveSync/driveApi.ts`:

```ts
export const DRIVE_BACKUP_FILENAME = "poultry-scale-backup.db";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const MULTIPART_BOUNDARY = "poultry-scale-backup-boundary";

async function driveFetch(url: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive API request failed: ${res.status} ${body}`);
  }
  return res;
}

export async function findBackupFile(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(`name='${DRIVE_BACKUP_FILENAME}'`);
  const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&q=${query}&fields=files(id,name)`;
  const res = await driveFetch(url, accessToken);
  const { files } = (await res.json()) as { files: { id: string }[] };
  return files[0]?.id ?? null;
}

// Multipart body: a metadata JSON part + a base64-encoded media part,
// separated by the boundary. Content-Transfer-Encoding: base64 on the
// media part lets a base64 string travel safely as request body text —
// no raw binary handling needed in the RN fetch layer.
function buildMultipartBody(base64Content: string, metadata: Record<string, unknown>) {
  return (
    `--${MULTIPART_BOUNDARY}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${MULTIPART_BOUNDARY}\r\n` +
    `Content-Type: application/octet-stream\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${base64Content}\r\n` +
    `--${MULTIPART_BOUNDARY}--`
  );
}

export async function createBackupFile(accessToken: string, base64Content: string): Promise<string> {
  const url = `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
  const body = buildMultipartBody(base64Content, {
    name: DRIVE_BACKUP_FILENAME,
    parents: ["appDataFolder"],
  });
  const res = await driveFetch(url, accessToken, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${MULTIPART_BOUNDARY}` },
    body,
  });
  const { id } = (await res.json()) as { id: string };
  return id;
}

export async function updateBackupFile(
  accessToken: string,
  fileId: string,
  base64Content: string,
): Promise<void> {
  const url = `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=multipart`;
  const body = buildMultipartBody(base64Content, {});
  await driveFetch(url, accessToken, {
    method: "PATCH",
    headers: { "Content-Type": `multipart/related; boundary=${MULTIPART_BOUNDARY}` },
    body,
  });
}

// No network call — Task 5 hands this URL to expo-file-system's
// downloadAsync, which streams the (binary) response straight to a file.
export function driveDownloadUrl(fileId: string): string {
  return `${DRIVE_FILES_URL}/${fileId}?alt=media`;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx jest __tests__/driveApi.test.ts -v`
Expected: all 6 tests PASS (3 for findBackupFile, 1 each for createBackupFile/updateBackupFile/driveDownloadUrl).

- [ ] **Step 5: Commit**

```bash
git add lib/driveSync/driveApi.ts __tests__/driveApi.test.ts
git commit -m "$(cat <<'EOF'
feat(backup): add Google Drive REST API wrapper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Supabase Edge Function — `drive-token`

**Files:**
- Create: `supabase/functions/drive-token/index.ts`

**Interfaces:**
- Produces: an HTTP endpoint, invoked from the app as `supabase.functions.invoke("drive-token")` (via the existing `useSupabase()` client — no new client setup needed), returning `{ accessToken: string }` on success.

No automated test exists for this task — it's a Deno Edge Function, a different runtime than this repo's Jest+Node test harness, and there is no Deno test setup in this repo. Verification is: (1) deploy it, (2) call it from a real signed-in session and confirm a token comes back, (3) use that token against a real Drive API call (e.g. `findBackupFile`) and confirm it doesn't get a 401.

- [ ] **Step 1: Write the function**

Create `supabase/functions/drive-token/index.ts`:

```ts
// Mints a short-lived Google Drive access token for the calling user.
// Runs server-side only — this is the one place CLERK_SECRET_KEY is used.
// The client never sees it.

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify the caller via the existing Clerk<->Supabase third-party auth
  // integration: forward the caller's JWT to Supabase's own auth endpoint
  // and let it tell us who's making this request. This avoids re-verifying
  // the JWT signature by hand — Supabase already knows how to do this
  // because of the existing Clerk integration.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { id: clerkUserId } = (await userRes.json()) as { id: string };

  const clerkSecretKey = Deno.env.get("CLERK_SECRET_KEY")!;
  const tokenRes = await fetch(
    `https://api.clerk.com/v1/users/${clerkUserId}/oauth_access_tokens/google`,
    { headers: { Authorization: `Bearer ${clerkSecretKey}` } },
  );
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: `Clerk token request failed: ${tokenRes.status} ${body}` }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
  const tokens = (await tokenRes.json()) as { token: string }[];
  const accessToken = tokens[0]?.token;
  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: "No Google account connected, or it lacks the drive.appdata scope" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ accessToken }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Deploy and configure secrets**

Run: `supabase functions deploy drive-token --no-verify-jwt --project-ref <project-ref>`

`--no-verify-jwt` matters here: Supabase Edge Functions default to a platform-level JWT gate that rejects a request before your handler code runs at all. There's a documented compatibility issue between that gate and Clerk's RS256-signed tokens (Supabase's own third-party-auth integration has an open report of this exact failure). This function doesn't need the platform gate anyway — it does its own equivalent check inside the handler (the `fetch` to `/auth/v1/user`, the same call `supabase-js`'s `auth.getUser()` makes under the hood), so disabling the platform gate here doesn't weaken security, it just avoids a known false-rejection failure mode for the auth path this function actually relies on. If, after deploying, every request gets rejected even with a valid signed-in session, this flag is the first thing to check.

Set the `CLERK_SECRET_KEY` secret (from the Clerk dashboard — API Keys — never the same as `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, which is a different, public key):

Run: `supabase secrets set CLERK_SECRET_KEY=sk_... --project-ref <project-ref>`

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are automatically available to every Edge Function in a Supabase project — no manual setup needed for those two.

- [ ] **Step 3: Add the Clerk Google connection scope**

In the Clerk dashboard: **User & Authentication → Social Connections → Google → Scopes**, add `https://www.googleapis.com/auth/drive.appdata`. This is a one-time external configuration step, same category as the earlier Supabase↔Clerk third-party auth setup.

- [ ] **Step 4: Manually verify**

From a signed-in session in the running app (a temporary debug call is fine — e.g. a `console.log` in a screen's `useEffect` calling `useSupabase().functions.invoke("drive-token")` — remove it after confirming), confirm the response is `{ accessToken: "..." }` with no error. If the Google account was connected *before* Step 3's scope was added, the user needs to re-authenticate (sign out and back in with Google) for the new scope to take effect — Clerk doesn't retroactively grant scopes to an existing connection.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/drive-token/index.ts
git commit -m "$(cat <<'EOF'
feat(backup): add drive-token Edge Function

Mints a short-lived Google Drive access token server-side, since
Clerk's oauth_access_tokens API requires the secret key and cannot
be called from the client.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Backup — snapshot, upload, queue clear

**Files:**
- Create: `lib/driveSync/backup.ts`
- Test: `__tests__/driveBackup.test.ts`

**Interfaces:**
- Consumes: `findBackupFile`, `createBackupFile`, `updateBackupFile`, `DRIVE_BACKUP_FILENAME` from `lib/driveSync/driveApi.ts` (Task 2); `dataBackupQueue` from `db/schema.ts`; `db` from `db/client.ts`.
- Produces: `runDriveBackup(getAccessToken: () => Promise<string>): Promise<void>` — exported for Task 6 (scheduling) to call. Also exports `LAST_BACKUP_AT_KEY` (an `AsyncStorage` key name) and `getLastBackupAt(): Promise<Date | null>` for Task 7's UI to display "last backed up X ago."

`getAccessToken` is injected as a parameter (rather than this file calling the Supabase Edge Function directly) so tests can supply a fake without a real network call — same pattern as `SupabaseClient` being injected into the earlier `flushBackupQueue`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/driveBackup.test.ts`:

```ts
import { db } from "../db/client";
import { users, dataBackupQueue } from "../db/schema";
import { applyMigrations, resetDb } from "./helpers/db";
import { runDriveBackup, getLastBackupAt } from "../lib/driveSync/backup";
import * as driveApi from "../lib/driveSync/driveApi";
import AsyncStorage from "@react-native-async-storage/async-storage";

beforeAll(() => applyMigrations());
beforeEach(() => {
  resetDb();
  (AsyncStorage as unknown as { __resetStore: () => void }).__resetStore();
  jest.restoreAllMocks();
});

const getAccessToken = async () => "fake-token";

describe("runDriveBackup", () => {
  it("does nothing when the queue is empty", async () => {
    const createSpy = jest.spyOn(driveApi, "createBackupFile");
    await runDriveBackup(getAccessToken);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("creates a new backup file when none exists yet, and clears the queue", async () => {
    await db.insert(users).values({ id: "u1", name: "Farmer A" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    const createSpy = jest.spyOn(driveApi, "createBackupFile").mockResolvedValue("new-file-id");

    await runDriveBackup(getAccessToken);

    expect(createSpy).toHaveBeenCalledWith("fake-token", expect.any(String));
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
    expect(await getLastBackupAt()).toBeInstanceOf(Date);
  });

  it("updates the existing backup file when one is already known, and clears the queue", async () => {
    await db.insert(users).values({ id: "u1" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue("existing-file-id");
    const updateSpy = jest.spyOn(driveApi, "updateBackupFile").mockResolvedValue(undefined);

    await runDriveBackup(getAccessToken);

    expect(updateSpy).toHaveBeenCalledWith("fake-token", "existing-file-id", expect.any(String));
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("reuses a cached file id on the next backup without searching again", async () => {
    await db.insert(users).values({ id: "u1" });
    const findSpy = jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    jest.spyOn(driveApi, "createBackupFile").mockResolvedValue("cached-id");
    await runDriveBackup(getAccessToken);

    await db.update(users).set({ name: "Changed" });
    const updateSpy = jest.spyOn(driveApi, "updateBackupFile").mockResolvedValue(undefined);
    await runDriveBackup(getAccessToken);

    expect(findSpy).toHaveBeenCalledTimes(1); // only on the first backup
    expect(updateSpy).toHaveBeenCalledWith("fake-token", "cached-id", expect.any(String));
  });

  it("leaves the queue untouched when the upload fails", async () => {
    await db.insert(users).values({ id: "u1" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    jest.spyOn(driveApi, "createBackupFile").mockRejectedValue(new Error("network down"));

    await runDriveBackup(getAccessToken);

    expect(await db.select().from(dataBackupQueue)).toHaveLength(1);
    expect(await getLastBackupAt()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/driveBackup.test.ts -v`
Expected: FAIL — `Cannot find module '../lib/driveSync/backup'`.

- [ ] **Step 3: Write the implementation**

Create `lib/driveSync/backup.ts`. Import `FileSystem` from `expo-file-system/legacy` (confirmed in Task 1 — the bare `expo-file-system` import is a different, class-based API and does not have these functions):

```ts
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "@/db/client";
import { dataBackupQueue } from "@/db/schema";
import {
  findBackupFile,
  createBackupFile,
  updateBackupFile,
} from "./driveApi";

export const LAST_BACKUP_AT_KEY = "drive-backup-last-at";
const CACHED_FILE_ID_KEY = "drive-backup-file-id";

export async function getLastBackupAt(): Promise<Date | null> {
  const v = await AsyncStorage.getItem(LAST_BACKUP_AT_KEY);
  return v ? new Date(v) : null;
}

// A clean, consistent single-file snapshot as of this moment — safer than
// copying the live db file directly, which may have an open WAL alongside it.
async function snapshotAsBase64(): Promise<string> {
  const snapshotPath = `${FileSystem.documentDirectory}drive-backup-snapshot.db`;
  db.$client.execSync(`VACUUM INTO '${snapshotPath.replace("file://", "")}'`);
  const base64 = await FileSystem.readAsStringAsync(snapshotPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.deleteAsync(snapshotPath, { idempotent: true });
  return base64;
}

export async function runDriveBackup(getAccessToken: () => Promise<string>): Promise<void> {
  const queued = await db.select().from(dataBackupQueue).limit(1);
  if (!queued.length) return;

  const accessToken = await getAccessToken();
  const base64 = await snapshotAsBase64();

  let fileId = await AsyncStorage.getItem(CACHED_FILE_ID_KEY);
  if (!fileId) {
    fileId = await findBackupFile(accessToken);
  }

  if (fileId) {
    await updateBackupFile(accessToken, fileId, base64);
  } else {
    fileId = await createBackupFile(accessToken, base64);
  }

  await AsyncStorage.setItem(CACHED_FILE_ID_KEY, fileId);
  await db.delete(dataBackupQueue);
  await AsyncStorage.setItem(LAST_BACKUP_AT_KEY, new Date().toISOString());
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx jest __tests__/driveBackup.test.ts -v`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/driveSync/backup.ts __tests__/driveBackup.test.ts
git commit -m "$(cat <<'EOF'
feat(backup): implement Drive snapshot + upload

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Restore — find, download, replace, confirm

**Files:**
- Create: `lib/driveSync/restore.ts`
- Test: `__tests__/driveRestore.test.ts`

**Interfaces:**
- Consumes: `findBackupFile`, `driveDownloadUrl` from `lib/driveSync/driveApi.ts` (Task 2); `dataBackupQueue`, `sales`, `users`, `batches` from `db/schema.ts`; `db` from `db/client.ts`.
- Produces:
  - `checkForRestorableBackup(getAccessToken: () => Promise<string>): Promise<{ fileId: string } | null>` — returns a restorable backup's file id if local data is empty and a Drive backup exists, `null` otherwise. Does not download or modify anything — this is the "should we prompt the user?" check.
  - `restoreFromDrive(getAccessToken: () => Promise<string>, fileId: string): Promise<void>` — downloads and imports the backup into the live local database. Called only after the user confirms (Task 7's UI owns the confirmation prompt itself — this function is the "yes" action).

**Why this doesn't touch the live database file or its connection:** an earlier version of this task closed the SQLite connection to swap the underlying file, then kept using the same (now-closed) connection object afterward — a guaranteed crash, and in the Jest harness, a way to permanently break every later test sharing that connection. The actual fix is to never touch the live file or connection at all. SQLite supports attaching a second database file to the same open connection (`ATTACH DATABASE '<path>' AS backup;`) and querying across both — so the downloaded backup is attached as a second database, its tables are copied into `main`'s tables via `INSERT INTO main.<table> SELECT * FROM backup.<table>`, and it's detached again. The app's one SQLite connection never closes.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/driveRestore.test.ts`:

```ts
import { db } from "../db/client";
import { users, batches, sales, dataBackupQueue } from "../db/schema";
import { applyMigrations, resetDb } from "./helpers/db";
import { checkForRestorableBackup, restoreFromDrive } from "../lib/driveSync/restore";
import * as driveApi from "../lib/driveSync/driveApi";
import * as FileSystem from "expo-file-system/legacy";
import fs from "fs";
import path from "path";
import os from "os";
import { DatabaseSync } from "node:sqlite";

beforeAll(() => applyMigrations());
beforeEach(() => {
  resetDb();
  jest.restoreAllMocks();
});

const getAccessToken = async () => "fake-token";

// Stands in for a real downloaded Drive backup: a standalone SQLite file
// built by applying the same migrations a real device's backup would have
// gone through (via node:sqlite directly, not through the app's `db`,
// since this has to be a genuinely separate file to attach to it).
function buildFakeBackupFile(): string {
  const migrationsDir = path.join(__dirname, "../db/migrations");
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf8"),
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-drive-backup-"));
  const filePath = path.join(dir, "backup.db");
  const source = new DatabaseSync(filePath);
  for (const entry of journal.entries) {
    const sql = fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      if (stmt.trim()) source.exec(stmt);
    }
  }
  source.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Restored Farmer');`);
  source.exec(
    `INSERT INTO batches (id, user_id, name, created_at, updated_at) VALUES ('b1', 'u1', 'Shed 1', 0, 0);`,
  );
  source.close();
  return filePath;
}

function mockDownloadAsCopyOf(sourcePath: string) {
  jest.spyOn(FileSystem, "downloadAsync").mockImplementation(async (_url: string, destUri: string) => {
    fs.copyFileSync(sourcePath, destUri.replace("file://", ""));
    return { uri: destUri } as any;
  });
}

describe("checkForRestorableBackup", () => {
  it("returns null when local data already exists", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.insert(sales).values({
      id: "s1", userId: "u1", phase: "main", isPcsTracked: true,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const findSpy = jest.spyOn(driveApi, "findBackupFile");

    expect(await checkForRestorableBackup(getAccessToken)).toBeNull();
    expect(findSpy).not.toHaveBeenCalled(); // never even asks Drive
  });

  it("returns null when local data is empty but Drive has no backup", async () => {
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    expect(await checkForRestorableBackup(getAccessToken)).toBeNull();
  });

  it("returns the file id when local data is empty and Drive has a backup", async () => {
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue("backup-file-id");
    expect(await checkForRestorableBackup(getAccessToken)).toEqual({ fileId: "backup-file-id" });
  });
});

describe("restoreFromDrive", () => {
  it("attaches the downloaded file, imports its rows, and clears the local queue", async () => {
    mockDownloadAsCopyOf(buildFakeBackupFile());

    await restoreFromDrive(getAccessToken, "backup-file-id");

    const [restoredUser] = await db.select().from(users);
    expect(restoredUser.name).toBe("Restored Farmer");
    const [restoredBatch] = await db.select().from(batches);
    expect(restoredBatch.name).toBe("Shed 1");
    // The INSERTs above fire the same triggers a normal write would —
    // clearing the queue afterward is what stops that from immediately
    // re-triggering a pointless backup of data that's already on Drive.
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("does not leave the temp download file behind", async () => {
    mockDownloadAsCopyOf(buildFakeBackupFile());

    await restoreFromDrive(getAccessToken, "backup-file-id");

    const info = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}drive-restore-temp.db`);
    expect(info.exists).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/driveRestore.test.ts -v`
Expected: FAIL — `Cannot find module '../lib/driveSync/restore'`.

- [ ] **Step 3: Write the implementation**

Create `lib/driveSync/restore.ts`. As in Task 4, import `FileSystem` from `expo-file-system/legacy` (see Task 1's note):

```ts
import * as FileSystem from "expo-file-system/legacy";
import { db } from "@/db/client";
import { dataBackupQueue, sales } from "@/db/schema";
import { findBackupFile, driveDownloadUrl } from "./driveApi";

const RESTORE_TEMP_PATH = `${FileSystem.documentDirectory}drive-restore-temp.db`;

// Parent-first — a child row's FK must already exist in `main` before the
// child is inserted. Matches the order migrations 0011/0012 populate.
const TABLES_IN_ORDER = [
  "users", "user_prefs", "batches", "sales",
  "sale_meta_data", "measurement_rows", "row_edit_history",
];

export async function checkForRestorableBackup(
  getAccessToken: () => Promise<string>,
): Promise<{ fileId: string } | null> {
  const hasLocalData = await db.select().from(sales).limit(1).get();
  if (hasLocalData) return null;

  const accessToken = await getAccessToken();
  const fileId = await findBackupFile(accessToken);
  return fileId ? { fileId } : null;
}

// Attaches the downloaded backup as a second database on the same, still-
// open connection, rather than closing/swapping the live db file — see
// this task's note above for why.
export async function restoreFromDrive(
  getAccessToken: () => Promise<string>,
  fileId: string,
): Promise<void> {
  const accessToken = await getAccessToken();

  const { uri } = await FileSystem.downloadAsync(driveDownloadUrl(fileId), RESTORE_TEMP_PATH, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const localPath = uri.startsWith("file://") ? uri.slice("file://".length) : uri;

  db.$client.execSync(`ATTACH DATABASE '${localPath}' AS backup;`);
  try {
    for (const table of TABLES_IN_ORDER) {
      db.$client.execSync(`INSERT INTO main.${table} SELECT * FROM backup.${table};`);
    }
  } finally {
    db.$client.execSync("DETACH DATABASE backup;");
  }

  await FileSystem.deleteAsync(RESTORE_TEMP_PATH, { idempotent: true });
  await db.delete(dataBackupQueue);
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx jest __tests__/driveRestore.test.ts -v`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/driveSync/restore.ts __tests__/driveRestore.test.ts
git commit -m "$(cat <<'EOF'
feat(backup): implement Drive restore

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Scheduling — wire backup/restore into app lifecycle

**Files:**
- Create: `lib/driveSync/schedule.ts`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `runDriveBackup` (Task 4), `checkForRestorableBackup`/`restoreFromDrive` (Task 5); `useSupabase` (existing, `hooks/useSupabase.ts`).
- Produces: `useDriveSync(userId: string | null | undefined)` — a hook returning `{ restorable: { fileId: string } | null, confirmRestore: () => Promise<void>, declineRestore: () => void, backupNow: () => Promise<void>, lastBackupAt: Date | null }`, mounted once in `AuthGuard`. Task 7's UI consumes this hook's return value directly — it does not call `lib/driveSync/*` functions itself.

Same trigger pattern already proven in the removed `lib/backupSync/schedule.ts`: periodic tick + `AppState` background transition (using the corrected `/inactive|background/` match, not the naive exact-string check) — plus this task adds the manual-trigger and restore-confirmation surface Task 7's UI needs. No automated test — same reasoning as before (RN lifecycle glue, no component test harness in this repo). Verify via the manual steps in Step 3.

- [ ] **Step 1: Write the token-fetching helper and the hook**

Create `lib/driveSync/schedule.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSupabase } from "@/hooks/useSupabase";
import { runDriveBackup, getLastBackupAt } from "./backup";
import { checkForRestorableBackup, restoreFromDrive } from "./restore";

const FLUSH_INTERVAL_MS = 10_000;

export function useDriveSync(userId: string | null | undefined) {
  const supabase = useSupabase();
  const supabaseRef = useRef(supabase);
  const appState = useRef(AppState.currentState);
  const [restorable, setRestorable] = useState<{ fileId: string } | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(null);

  useEffect(() => {
    supabaseRef.current = supabase;
  }, [supabase]);

  const getAccessToken = useCallback(async () => {
    const { data, error } = await supabaseRef.current.functions.invoke<{ accessToken: string }>(
      "drive-token",
    );
    if (error || !data?.accessToken) {
      throw new Error(`Could not get a Drive access token: ${error?.message ?? "no token returned"}`);
    }
    return data.accessToken;
  }, []);

  const backup = useCallback(async () => {
    try {
      await runDriveBackup(getAccessToken);
      setLastBackupAt(await getLastBackupAt());
    } catch (err) {
      console.warn("[driveSync] backup failed", err);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      try {
        const found = await checkForRestorableBackup(getAccessToken);
        if (!cancelled) setRestorable(found);
      } catch (err) {
        console.warn("[driveSync] restore check failed", err);
      }
      setLastBackupAt(await getLastBackupAt());
      if (!cancelled) await backup();
    })();

    const interval = setInterval(backup, FLUSH_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current === "active" && /inactive|background/.test(next)) {
        backup();
      }
      appState.current = next;
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, [userId, getAccessToken, backup]);

  const confirmRestore = useCallback(async () => {
    if (!restorable) return;
    await restoreFromDrive(getAccessToken, restorable.fileId);
    setRestorable(null);
  }, [restorable, getAccessToken]);

  const declineRestore = useCallback(() => setRestorable(null), []);

  return { restorable, confirmRestore, declineRestore, backupNow: backup, lastBackupAt };
}
```

- [ ] **Step 2: Wire it into the root layout**

Modify `app/_layout.tsx`. Remove the old import and call:

```diff
-import { useBackupSync } from "@/lib/backupSync/schedule";
+import { useDriveSync } from "@/lib/driveSync/schedule";
```

```diff
   const handledUserId = useRef<string | null>(null);
-  useBackupSync(isSignedIn ? user?.id : null);
+  const driveSync = useDriveSync(isSignedIn ? user?.id : null);
```

`driveSync` isn't consumed further inside `AuthGuard` itself — Task 7 reads it from a shared place. For this task, the minimal correct wiring is calling the hook so its effects run; how its return value reaches the restore-prompt UI and the Settings screen's "Back up now" button is Task 7's job. If `AuthGuard`'s existing structure makes prop-drilling `driveSync` down to a restore-prompt component awkward, note that as a concern in this task's report rather than inventing a context provider here — Task 7 owns that decision.

- [ ] **Step 3: Typecheck and manually verify**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run the app, sign in, background it, and confirm (via added temporary logging, removed afterward) that `backupNow`/the interval actually calls `runDriveBackup` and that `data_backup_queue` empties out after a successful upload — this requires Task 3's Edge Function to be deployed and the Clerk Google connection to have the `drive.appdata` scope (re-authenticate if the account was connected before that scope was added).

- [ ] **Step 4: Commit**

```bash
git add lib/driveSync/schedule.ts app/_layout.tsx
git commit -m "$(cat <<'EOF'
feat(backup): schedule Drive backup/restore on app lifecycle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: UI — restore prompt and "Back up now"

**Files:**
- Modify: `app/_layout.tsx` (render the restore prompt)
- Modify: `app/settings.tsx` (add a "Back up now" row + last-backed-up-at display)

**Interfaces:**
- Consumes: `useDriveSync`'s return value from Task 6 (`restorable`, `confirmRestore`, `declineRestore`, `backupNow`, `lastBackupAt`).

No automated test — this is UI wiring in files with no existing component test coverage (same reasoning as Task 6). Verify manually per Step 3.

- [ ] **Step 1: Render the restore prompt**

In `app/_layout.tsx`'s `AuthGuard` (from Task 6's `const driveSync = useDriveSync(...)`), render a confirmation UI when `driveSync.restorable` is set. Use this repo's existing `Alert`-based confirmation pattern if one already exists elsewhere in the codebase (check `app/settings.tsx`/`app/profile.tsx` for an existing `Alert.alert(...)` confirm/cancel usage before writing a new one — reuse that pattern rather than building a custom modal). The prompt copy: title `"Backup found"`, message `"We found a backup of your data. Restore it now?"`, buttons `"Restore"` (calls `driveSync.confirmRestore()`) and `"Not now"` (calls `driveSync.declineRestore()`).

- [ ] **Step 2: Add the "Back up now" row to Settings**

In `app/settings.tsx`, add a row (matching the screen's existing row/section styling — read the file's existing sections before adding this one, to match spacing, icons, and text style conventions already used there) that:
- Calls `useDriveSync`'s `backupNow` and `lastBackupAt` — since `useDriveSync` is already mounted once in `AuthGuard` per Task 6, decide during implementation whether Settings should call `useDriveSync` a second time (cheap — it's just hook state, not a second set of timers, since a second mount would start its own separate interval/listener) or whether `driveSync`'s value needs to be threaded down via context so there's only ever one active scheduler. Prefer a single scheduler: if calling the hook twice, in practice, results in two independent interval timers both trying to back up, that's wasteful and worth avoiding — thread the value down via a lightweight context if so. Note whichever approach was taken in this task's report.
- Displays `lastBackupAt` as relative or absolute text (e.g. "Last backed up 2 hours ago", or "Never backed up yet" if `null`) — check `lib/i18n.ts` for whether this repo has an existing relative-time helper before writing a new one.
- Shows a loading state on the button while `backupNow()`'s promise is pending, and a brief success/failure indication after it resolves/rejects (check existing patterns in `app/settings.tsx` for how other async actions in this screen already give feedback, e.g. `Haptics` calls are already imported there).

- [ ] **Step 3: Manually verify**

Run the app. With a signed-in test account: confirm the Settings row shows "Never backed up yet" initially, tapping "Back up now" triggers a real Drive upload (check the Drive API response / the account's `appDataFolder` via the Drive API explorer, since `appDataFolder` files don't show in the normal Drive UI), and the row updates to show a recent timestamp afterward. Then, on a second device or after clearing local app data, confirm the restore prompt appears and "Restore" actually repopulates the local data.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx app/settings.tsx
git commit -m "$(cat <<'EOF'
feat(backup): add restore prompt and manual backup UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Remove the old Supabase raw-mirror engine + update docs

**Files:**
- Remove: `supabase/backup_mirror.sql`, `lib/backupSync/flush.ts`, `lib/backupSync/restore.ts`, `lib/backupSync/schedule.ts`, `lib/backupSync/tables.ts`
- Remove: `__tests__/backupFlush.test.ts`, `__tests__/backupRestore.test.ts` (these test the removed `lib/backupSync/flush.ts`/`restore.ts` — not the new `lib/driveSync/*` files, which have their own new tests from Tasks 2/4/5)
- Modify: `README.md`

**Interfaces:** None — this is deletion and documentation only. By this point in the plan (Task 6 already removed the `lib/backupSync/schedule.ts` import from `app/_layout.tsx`), nothing in the app references the files being deleted here.

- [ ] **Step 1: Confirm nothing still references the files being removed**

Run: `grep -rn "backupSync" app/ lib/ db/ --include="*.ts" --include="*.tsx"`
Expected: no output (Task 6 already removed the only import). If anything shows up, stop and resolve it before deleting — don't delete a file something still imports.

- [ ] **Step 2: Remove the files**

```bash
git rm supabase/backup_mirror.sql
git rm lib/backupSync/flush.ts lib/backupSync/restore.ts lib/backupSync/schedule.ts lib/backupSync/tables.ts
git rm __tests__/backupFlush.test.ts __tests__/backupRestore.test.ts
```

(Note: `__tests__/backupQueue.test.ts` is NOT removed — it tests the triggers on `db/schema.ts`'s `dataBackupQueue` table, which this plan's Global Constraints say to keep and reuse exactly as-is.)

- [ ] **Step 3: Run the full suite**

Run: `npx jest`
Expected: all remaining tests pass (the two removed test files' tests are gone; everything else — `backupQueue.test.ts` and this plan's new `driveApi.test.ts`/`driveBackup.test.ts`/`driveRestore.test.ts` — passes).

- [ ] **Step 4: Update README**

In `README.md`, replace the "Backup sync (Supabase) — one-time project setup" section (added when the now-removed engine was merged) with a "Backup (Google Drive)" section describing: the Clerk Google connection needs the `drive.appdata` scope added (Clerk dashboard), the `drive-token` Edge Function needs to be deployed with `CLERK_SECRET_KEY` set as a Supabase secret (per Task 3), and backups live in each user's hidden Drive `appDataFolder` — there is no shared database of personal data anymore.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(backup): remove the Supabase raw-mirror engine

Superseded by Google Drive backup (this plan). Supabase's role in
personal backup ends here — its future role is the community
analytics dataset, which is separate, later work.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Manual step outside this plan

Before this feature does anything real: (1) the Clerk dashboard needs the `drive.appdata` scope added to the Google connection (Task 3, Step 3), (2) the `drive-token` Edge Function needs to be deployed with `--no-verify-jwt` and `CLERK_SECRET_KEY` set (Task 3, Step 2 — the flag matters: Supabase's platform-level JWT gate has a documented issue with Clerk's RS256 tokens, and this function does its own equivalent check internally anyway), and (3) any account that connected Google *before* the scope was added needs to disconnect/reconnect (sign out, sign back in with Google) for the new scope to actually apply.
