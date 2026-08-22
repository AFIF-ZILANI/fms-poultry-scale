import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSupabase } from "@/hooks/useSupabase";
import { flushCommunityPushQueue, type CommunityPushPayload } from "./push";

// Same cadence as lib/driveSync/schedule.ts's own interval — no reason
// for these two background flush loops to run on different clocks.
const FLUSH_INTERVAL_MS = 60_000;

// No UI reads this hook's output — unlike useDriveSync, there is no
// "push status" surface anywhere in the app (spec §7). It exists purely
// to be mounted for its side effects.
export function useCommunityPush(userId: string | null | undefined): void {
  const supabase = useSupabase();
  const supabaseRef = useRef(supabase);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    supabaseRef.current = supabase;
  }, [supabase]);

  const invoke = useCallback(async (payload: CommunityPushPayload): Promise<boolean> => {
    try {
      const { error } = await supabaseRef.current.functions.invoke("push-community-sale", {
        body: payload,
      });
      if (error) {
        console.warn(`[communityPush] push failed for sale ${payload.saleId}`, error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn(`[communityPush] push threw for sale ${payload.saleId}`, err);
      return false;
    }
  }, []);

  const flush = useCallback(async (uid: string) => {
    try {
      await flushCommunityPushQueue(invoke, uid);
    } catch (err) {
      console.warn("[communityPush] flush failed", err);
    }
  }, [invoke]);

  useEffect(() => {
    if (!userId) return;

    const uid = userId;
    console.log(`[communityPush] mounted for user ${uid}`);
    flush(uid);

    const interval = setInterval(() => {
      console.log("[communityPush] trigger: interval");
      flush(uid);
    }, FLUSH_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current === "active" && /inactive|background/.test(next)) {
        console.log("[communityPush] trigger: app backgrounded");
        flush(uid);
      }
      appState.current = next;
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [userId, flush]);
}
