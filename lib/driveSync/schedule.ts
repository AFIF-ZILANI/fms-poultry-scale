import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSupabase } from "@/hooks/useSupabase";
import { runDriveBackup, getLastBackupAt, setRestorePending } from "./backup";
import { checkForRestorableBackup, restoreFromDrive } from "./restore";

// ponytail: 60s balances freshness against not hammering a full-db
// VACUUM + base64 + upload every tick; tune if real usage shows it's too
// slow/fast. Backgrounding the app and the manual button stay immediate,
// so this only sets how often an idle, foregrounded app re-checks.
const FLUSH_INTERVAL_MS = 60_000;

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
    console.log("[driveSync] invoking drive-token Edge Function");
    const { data, error } = await supabaseRef.current.functions.invoke<{ accessToken: string }>(
      "drive-token",
    );
    if (error || !data?.accessToken) {
      console.warn("[driveSync] drive-token Edge Function failed", error);
      throw new Error(`Could not get a Drive access token: ${error?.message ?? "no token returned"}`);
    }
    console.log("[driveSync] drive-token Edge Function succeeded");
    return data.accessToken;
  }, []);

  // Automatic triggers (the interval, AppState) call this with no argument:
  // failures are swallowed and logged, since nothing awaits or .catch()s a
  // fire-and-forget interval/listener callback — letting it throw there
  // would just reintroduce an unhandled-rejection crash risk.
  //
  // The manual "back up now" button needs the opposite: real success/
  // failure feedback, not a silent swallow that always resolves. Passing
  // rethrow=true (via the backupNow wrapper below) makes a real failure
  // surface as a rejection the caller can catch — without changing
  // anything about the silent automatic path.
  // Returns whether an upload actually happened (see runDriveBackup) —
  // false means this call was skipped (already in flight, or a restore is
  // pending), not that it failed. backupNow (rethrow=true) propagates this
  // so the manual "Back up now" button can tell a real success from a skip.
  const backup = useCallback(async (rethrow = false): Promise<boolean> => {
    if (!userId) return false;
    try {
      const completed = await runDriveBackup(getAccessToken, userId);
      setLastBackupAt(await getLastBackupAt(userId));
      return completed;
    } catch (err) {
      console.warn("[driveSync] backup failed", err);
      if (rethrow) throw err;
      return false;
    }
  }, [getAccessToken, userId]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      // Both steps share one try/catch — a fire-and-forget async IIFE has
      // nothing to .catch() it, so an unguarded await here (this exact
      // failure mode was a documented crash cause in the engine this
      // replaces) becomes an unhandled rejection, which RN escalates to a
      // crash in release builds.
      // Blocks every automatic backup — this effect's own call below, the
      // interval, the AppState listener — until we know whether there is a
      // backup to restore and, if so, until the user answers the prompt.
      // Otherwise the near-empty local db gets uploaded over the very file
      // they're about to restore from, which is unrecoverable. Assume the
      // worst while the check is still in flight; clear it if the check
      // fails or finds nothing (which also clears a stale block left by a
      // previous account).
      console.log(`[driveSync] mounted for user ${userId}, checking for a restorable backup`);
      setRestorePending(true);
      try {
        const found = await checkForRestorableBackup(getAccessToken);
        if (!cancelled) setRestorePending(!!found);
        if (!cancelled) setRestorable(found);
        setLastBackupAt(await getLastBackupAt(userId));
      } catch (err) {
        setRestorePending(false);
        console.warn("[driveSync] mount check failed", err);
      }
      if (!cancelled) {
        console.log("[driveSync] trigger: mount");
        await backup();
      }
    })();

    const interval = setInterval(() => {
      console.log("[driveSync] trigger: interval");
      backup();
    }, FLUSH_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current === "active" && /inactive|background/.test(next)) {
        console.log("[driveSync] trigger: app backgrounded");
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
    console.log("[driveSync] user confirmed restore");
    // Unblocked only on success: a failed restore leaves the Drive file as
    // the only copy of this user's data, so backups stay blocked rather
    // than overwrite it. The next launch re-runs the check and unblocks.
    await restoreFromDrive(getAccessToken, restorable.fileId);
    setRestorePending(false);
    setRestorable(null);
  }, [restorable, getAccessToken]);

  const declineRestore = useCallback(() => {
    console.log("[driveSync] user declined restore");
    setRestorePending(false);
    setRestorable(null);
  }, []);

  return {
    restorable,
    confirmRestore,
    declineRestore,
    backupNow: () => {
      console.log("[driveSync] trigger: manual back up now");
      return backup(true); // rethrows on failure — see the comment above `backup`
    },
    lastBackupAt,
  };
}
