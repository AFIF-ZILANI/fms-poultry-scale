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
      if (appState.current === "active" && next === "background") {
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
