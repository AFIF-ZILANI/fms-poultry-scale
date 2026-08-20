# Google Drive Backup & Restore — Design Spec

Status: approved, ready for implementation planning
Scope: replace the Supabase raw-mirror backup engine with a Google Drive-based
personal backup, for every user regardless of subscription plan.

Explicitly OUT of scope for this spec (separate, later work):
- The community analytics dataset (star schema: `farm_profile`/`batch_profile`/`sale_event`)
- The per-sale plan flag and the filtered push that feeds that dataset
- Any UI for the community/premium plan toggle itself (unchanged by this work)

---

## 1. Background — why this replaces the merged Supabase engine

A prior design (`docs/superpowers/specs/2026-08-19-backup-sync-engine-design.md`)
built a Supabase Postgres mirror of every user's local SQLite tables, pushed
via triggers + a dirty queue, restorable on reinstall. That was merged to
`main`, but the real goal has since been clarified:

- **Personal backup belongs to the user, not a shared database.** Every
  user's data — community and premium alike — should back up to *their own*
  Google Drive, not a table this app's operators control.
- **Supabase's role is narrower and different in shape.** It will eventually
  hold only the community analytics dataset (a different schema entirely —
  aggregated/denormalized for analytics and model training, not a 1:1 mirror
  of operational tables), fed by a per-sale plan flag deferred to later work
  (see §7).

Because of this, `supabase/backup_mirror.sql` and `lib/backupSync/flush.ts` /
`restore.ts` (the raw-mirror push/pull) are being removed, not run alongside
the new engine — leaving them in place would keep pushing personal data
to a shared database, which is exactly what this change exists to stop.

**What's being reused, not rebuilt:** the local `data_backup_queue` table and
its 21 populating triggers (`db/migrations/0011`–`0012`) work exactly as
before. Their meaning simply changes — "queue non-empty" now means "a Drive
backup is due," not "rows are waiting to be pushed to Supabase."

## 2. Goals

- Every user's data backs up to their own Google Drive, automatically,
  regardless of subscription plan.
- Offline-first: a failed backup attempt leaves the queue untouched and
  retries on the next trigger — no special network-state detection needed.
- A fresh install/new device can restore from that Drive backup, with the
  user's explicit confirmation (not silent).
- Reuse the existing dirty-tracking infrastructure rather than rebuilding it.
- No secret ever ships to the client — the piece that needs Clerk's secret
  key runs server-side.

## 3. Architecture

```
Clerk (Google OAuth, drive.appdata scope added)
  └─ user signs in — Clerk stores the Google external account

Supabase Edge Function: drive-token
  ├─ Verifies the caller via the existing Clerk↔Supabase JWT integration
  ├─ Calls Clerk's REST API server-side (secret key, plain fetch — no SDK)
  │  GET https://api.clerk.com/v1/users/{user_id}/oauth_access_tokens/google
  └─ Returns a short-lived Google Drive access token to the app

Local SQLite (unchanged)
  ├─ Existing triggers (migrations 0011/0012) keep populating
  │  data_backup_queue on every write — reused as-is
  │
  └─ Drive sync flush (debounced, or on background/foreground/manual button)
        → if queue is non-empty:
            1. VACUUM INTO a temp snapshot file (consistent, no live-file risk)
            2. fetch a fresh Drive token from the Edge Function
            3. upload/replace the snapshot in the user's Drive appDataFolder
            4. on success: clear data_backup_queue, record lastBackupAt
            5. on failure: leave the queue untouched — retried next trigger

Google Drive (per user, hidden appDataFolder — not visible in their normal
Drive UI, accessible only by this app)
  └─ One file: the latest snapshot, overwritten each successful backup

Restore (on first launch, local data empty, Drive has a backup file)
  → prompt: "We found a backup from <date> — restore it?"
  → on confirm: download the file, replace the local db, reopen/re-migrate
```

## 4. Google Drive access

**Scope:** `https://www.googleapis.com/auth/drive.appdata` — added to the
existing Clerk Google connection (Clerk dashboard, one-time external config,
same pattern as the earlier Supabase↔Clerk integration step). This is a
non-sensitive scope (no Google app-verification review required) restricted
to the hidden per-app storage space — the user never sees these files in
their normal Drive UI, and no other app can read them.

**Token retrieval — why it needs a server:** Clerk's `getUserOauthAccessToken()`
requires Clerk's secret key and is backend-only; a mobile client cannot call
it directly without exposing that secret. The Supabase Edge Function
`drive-token` is the one new piece of server-side infrastructure this
feature needs — nothing else changes about the app's deployment shape.

**API calls** (plain `fetch()`, no Google client library needed):
- Find the existing backup file: `GET https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='poultry-scale-backup.db'`
- Create (first backup): `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, `parents: ["appDataFolder"]`
- Update (subsequent backups): `PATCH https://www.googleapis.com/upload/drive/v3/files/{fileId}?uploadType=media`
- Download (restore): `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media`

The discovered/created `fileId` is cached in `AsyncStorage` after the first
successful backup to skip the search on subsequent runs; if a cached ID
ever 404s, fall back to the search-by-name query (self-healing, no manual
recovery needed).

## 5. Snapshot mechanics

**Why `VACUUM INTO`, not a raw file copy:** SQLite may have an open WAL/
journal alongside the live database file; copying the raw file mid-write
risks an inconsistent snapshot. `VACUUM INTO '<temp-path>'` (run via
`db.$client.execSync`) produces a clean, complete, single-file snapshot as
of that moment, safe to copy or upload directly.

**New dependency: `expo-file-system`.** Reading the `VACUUM INTO` output
into memory (for the upload body) and writing a downloaded restore file to
disk needs real file I/O, which this project doesn't have a module for yet.
This is the one new dependency the feature needs — an official Expo SDK
module (not a third-party library), the natural and only sane choice for
file access in this stack.

## 6. Trigger conditions (matches the design intent already validated for the previous engine)

- Periodic tick while the app is active (same pattern already proven).
- App transitioning to background.
- Manual **"Back up now"** button in Settings/Profile — gives the user
  visible confirmation the feature works, not just silent background magic.
- On failure, no special handling: the queue stays populated, and the next
  of any of the above triggers retries automatically. This is what makes it
  offline-first — no network-state listener needed, retries happen for free
  on the existing lifecycle triggers.

## 7. Restore

- **Trigger:** app launch, user signed in, local `sales`/`batches` empty
  (same emptiness heuristic as before — known limitation, unchanged: a user
  who empties their own data through normal use could theoretically
  re-trigger this. Out of scope to fix further here; same tradeoff already
  accepted for the previous engine).
- **Confirmation required, not silent.** Unlike the previous engine's
  automatic restore, replacing the *entire* local database from a
  downloaded file is consequential enough, and Drive is now the *only*
  restore path (no silent fallback), to warrant asking first: *"We found a
  backup from `<date>` — restore it?"*
- **On confirm:** download the snapshot, replace the local database file,
  close and reopen the SQLite connection so the app picks up the restored
  data, and clear `data_backup_queue` locally (the restored file already
  reflects everything backed up — nothing new to push from this action, and
  clearing avoids the file being immediately marked dirty again).
- **On decline:** proceed as a normal fresh install. The backup file stays
  on Drive; nothing is deleted. (No re-prompt loop is designed here — a
  declined restore is a one-time choice for this session; revisiting that
  choice, if ever needed, is a UI detail for the implementation plan, not a
  new architectural decision.)

## 8. File structure

- Create: `supabase/functions/drive-token/index.ts` (Edge Function)
- Create: `lib/driveSync/backup.ts` (snapshot + upload + queue-clear)
- Create: `lib/driveSync/restore.ts` (find + download + replace + prompt trigger)
- Create: `lib/driveSync/driveApi.ts` (thin wrapper over the 4 Drive REST
  calls in §4 — shared by backup.ts and restore.ts, keeps HTTP details out
  of the sync logic)
- Create: `lib/driveSync/schedule.ts` (replaces `lib/backupSync/schedule.ts` —
  periodic tick, AppState background, exposes a manual-trigger function for
  the Settings/Profile button)
- Modify: `app/_layout.tsx` — swap `useBackupSync` for the new Drive hook
- Modify: `app/settings.tsx` or `app/profile.tsx` — add "Back up now" /
  restore-status UI (exact placement decided in the implementation plan
  against the current screen, not fixed here)
- Modify: `package.json` — add `expo-file-system`
- Remove: `supabase/backup_mirror.sql`
- Remove: `lib/backupSync/flush.ts`, `lib/backupSync/restore.ts`,
  `lib/backupSync/schedule.ts`, `lib/backupSync/tables.ts` (the per-table
  registry has no role in a whole-file backup; if the community-dataset
  work later needs a table registry, it will look different — shaped for
  the analytics schema, not this one — so nothing here is worth preserving
  for reuse)
- Keep unchanged: `db/schema.ts`'s `dataBackupQueue` table, migrations
  `0011`/`0012`/`0013`, `hooks/useSupabase.ts` (still used for the Edge
  Function call)

## 9. Explicitly out of scope

- The community analytics dataset, the per-sale plan flag, and the filtered
  push that feeds it — separate, later work, per the user's own stated
  priority ("make first the google drive backup, restore first, then we
  will go ahead to global dataset").
- Re-prompting a user who declined a restore.
- Any change to how the community/premium plan is chosen or displayed.
