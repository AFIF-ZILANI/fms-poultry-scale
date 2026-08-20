import React, { createContext, useContext, type ReactNode } from "react";
import type { useDriveSync } from "./driveSync/schedule";

// ponytail: useDriveSync has real side effects (interval timer, AppState
// subscription, network calls) — it must be called exactly once per app
// session (in AuthGuard). This context just threads that single instance's
// value down to screens like Settings, instead of mounting the hook again.
type DriveSyncValue = ReturnType<typeof useDriveSync>;

const DriveSyncContext = createContext<DriveSyncValue | null>(null);

export function DriveSyncProvider({
  value,
  children,
}: {
  value: DriveSyncValue;
  children: ReactNode;
}) {
  return (
    <DriveSyncContext.Provider value={value}>
      {children}
    </DriveSyncContext.Provider>
  );
}

export function useDriveSyncContext(): DriveSyncValue {
  const ctx = useContext(DriveSyncContext);
  if (!ctx) {
    throw new Error("useDriveSyncContext must be used within DriveSyncProvider");
  }
  return ctx;
}
