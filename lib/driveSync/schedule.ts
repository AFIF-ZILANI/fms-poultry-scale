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
      // Both steps share one try/catch — a fire-and-forget async IIFE has
      // nothing to .catch() it, so an unguarded await here (this exact
      // failure mode was a documented crash cause in the engine this
      // replaces) becomes an unhandled rejection, which RN escalates to a
      // crash in release builds.
      try {
        const found = await checkForRestorableBackup(getAccessToken);
        if (!cancelled) setRestorable(found);
        setLastBackupAt(await getLastBackupAt());
      } catch (err) {
        console.warn("[driveSync] mount check failed", err);
      }
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
