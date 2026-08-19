import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSupabase } from "@/hooks/useSupabase";
import { flushBackupQueue } from "./flush";
import { restoreIfEmpty } from "./restore";

const FLUSH_INTERVAL_MS = 10_000;

export function useBackupSync(userId: string | null | undefined): void {
  const supabase = useSupabase();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      await restoreIfEmpty(userId, supabase);
      if (!cancelled) await flushBackupQueue(supabase);
    })();

    const interval = setInterval(() => {
      flushBackupQueue(supabase);
    }, FLUSH_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      // iOS transitions active -> inactive -> background as two separate
      // events, not one direct active -> background jump — matching only
      // the exact jump would mean this trigger never fires on iOS. Fire on
      // the first transition away from "active" instead, which covers both
      // platforms.
      if (appState.current === "active" && /inactive|background/.test(next)) {
        flushBackupQueue(supabase);
      }
      appState.current = next;
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, [userId, supabase]);
}
