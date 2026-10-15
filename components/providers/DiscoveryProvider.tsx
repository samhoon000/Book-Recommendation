"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { EMPTY_PREFERENCES, type Preferences } from "@/types/preferences";
import { sanitizePreferences } from "@/lib/discovery/sanitize";
import { KEYS, readJson, removeKey, writeJson } from "@/lib/storage/storage";

interface DiscoveryApi {
  prefs: Preferences;
  hydrated: boolean;
  step: number;
  setStep: (step: number) => void;
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
  /** True when the reader has expressed anything at all. */
  hasAnswers: boolean;
}

const DiscoveryContext = createContext<DiscoveryApi | null>(null);

/**
 * Holds the reader's answers across the discovery flow and results.
 * Preferences persist in localStorage (so "Edit your preferences" never loses them);
 * the current step lives in sessionStorage.
 */
export function DiscoveryProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFERENCES);
  const [step, setStepState] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Storage is only readable in the browser, after hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPrefs(readJson(KEYS.preferences, EMPTY_PREFERENCES, "local", sanitizePreferences));
    setStepState(readJson(KEYS.discoveryStep, 0, "session", (v) => (typeof v === "number" && v >= 0 && v < 8 ? v : 0)));
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      writeJson(KEYS.preferences, next);
      return next;
    });
  }, []);

  const setStep = useCallback((s: number) => {
    setStepState(s);
    writeJson(KEYS.discoveryStep, s, "session");
  }, []);

  const reset = useCallback(() => {
    setPrefs(EMPTY_PREFERENCES);
    setStepState(0);
    removeKey(KEYS.preferences);
    removeKey(KEYS.discoveryStep, "session");
    removeKey(KEYS.results, "session");
  }, []);

  const hasAnswers = useMemo(() => JSON.stringify(prefs) !== JSON.stringify(EMPTY_PREFERENCES), [prefs]);

  const api = useMemo(() => ({ prefs, hydrated, step, setStep, update, reset, hasAnswers }), [prefs, hydrated, step, setStep, update, reset, hasAnswers]);
  return <DiscoveryContext.Provider value={api}>{children}</DiscoveryContext.Provider>;
}

export function useDiscovery(): DiscoveryApi {
  const ctx = useContext(DiscoveryContext);
  if (!ctx) throw new Error("useDiscovery must be used inside DiscoveryProvider");
  return ctx;
}
