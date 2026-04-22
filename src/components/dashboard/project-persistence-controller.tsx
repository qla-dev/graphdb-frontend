import { useEffect, useState } from "react";
import {
  SESSION_CHANGE_EVENT,
  hasActiveSession
} from "@/lib/auth/session";
import { useSchemaStore } from "@/lib/store/schema-store";

export function ProjectPersistenceController() {
  const [isAuthenticated, setIsAuthenticated] = useState(hasActiveSession);
  const storageHydrated = useSchemaStore((state) => state.storageHydrated);
  const projectSelectionRequired = useSchemaStore(
    (state) => state.projectSelectionRequired
  );
  const saveStatus = useSchemaStore((state) => state.saveStatus);
  const code = useSchemaStore((state) => state.code);
  const format = useSchemaStore((state) => state.format);
  const projectName = useSchemaStore((state) => state.schemeName);
  const nodePositions = useSchemaStore((state) => state.nodePositions);
  const groups = useSchemaStore((state) => state.groups);
  const initializePersistence = useSchemaStore(
    (state) => state.initializePersistence
  );
  const resetForSessionLock = useSchemaStore(
    (state) => state.resetForSessionLock
  );
  const saveCurrentScheme = useSchemaStore((state) => state.saveCurrentScheme);

  useEffect(() => {
    const syncSessionState = () => {
      const hasSession = hasActiveSession();
      setIsAuthenticated(hasSession);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncSessionState();
      }
    };

    syncSessionState();

    const intervalId = window.setInterval(syncSessionState, 1000);
    window.addEventListener("focus", syncSessionState);
    window.addEventListener(SESSION_CHANGE_EVENT, syncSessionState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncSessionState);
      window.removeEventListener(SESSION_CHANGE_EVENT, syncSessionState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      resetForSessionLock();
      return;
    }

    void initializePersistence({
      autoLoadActive: false,
      requireProjectSelection: true
    });
  }, [initializePersistence, isAuthenticated, resetForSessionLock]);

  useEffect(() => {
    if (
      !storageHydrated ||
      projectSelectionRequired ||
      saveStatus !== "dirty"
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveCurrentScheme();
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [
    code,
    format,
    groups,
    nodePositions,
    saveCurrentScheme,
    saveStatus,
    projectSelectionRequired,
    projectName,
    storageHydrated
  ]);

  return null;
}
