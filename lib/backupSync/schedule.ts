import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSupabase } from "@/hooks/useSupabase";
import { flushBackupQueue } from "./flush";
import { restoreIfEmpty } from "./restore";

const FLUSH_INTERVAL_MS = 10_000;

export function useBackupSync(userId: string | null | undefined): void {
  const supabase = useSupabase();
  const appState = useRef(AppState.currentState);

  // The client is held in a ref rather than read from the effect's closure so
  // the effect below can key on userId alone. useSupabase() memoizes on
  // Clerk's getToken, whose identity is not guaranteed stable across renders;
  // keying the effect on the client object would tear down and recreate the
  // interval on every render, so the 10s tick could never actually fire.
  const supabaseRef = useRef(supabase);
  useEffect(() => {
    supabaseRef.current = supabase;
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    // Both restore and flush can now throw (a Supabase error is no longer
    // swallowed), and nothing awaits these — without a catch they would be
    // unhandled rejections, which RN escalates to a crash in release builds.
    const flush = () =>
      flushBackupQueue(supabaseRef.current).catch((e) =>
        console.warn("[backupSync] flush failed", e),
      );

    (async () => {
      try {
        await restoreIfEmpty(userId, supabaseRef.current);
        if (!cancelled) await flushBackupQueue(supabaseRef.current);
      } catch (e) {
        // Left unresolved on purpose: restoreIfEmpty only persists its
        // one-time flag on a clean path, so the next launch retries.
        console.warn("[backupSync] startup restore/flush failed", e);
      }
    })();

    const interval = setInterval(flush, FLUSH_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      // iOS transitions active -> inactive -> background as two separate
      // events, not one direct active -> background jump — matching only
      // the exact jump would mean this trigger never fires on iOS. Fire on
      // the first transition away from "active" instead, which covers both
      // platforms.
      if (appState.current === "active" && /inactive|background/.test(next)) {
        flush();
      }
      appState.current = next;
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, [userId]);
}
