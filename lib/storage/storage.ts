/**
 * Safe wrappers around Web Storage. Storage can be unavailable (private windows, blocked cookies,
 * server rendering), so every call is guarded and failures fall back to defaults.
 */

type Area = "local" | "session";

function area(kind: Area): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function readJson<T>(key: string, fallback: T, kind: Area = "local", validate?: (v: unknown) => T): T {
  try {
    const raw = area(kind)?.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return validate ? validate(parsed) : (parsed as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown, kind: Area = "local"): void {
  try {
    area(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled: the app keeps working in memory.
  }
}

export function removeKey(key: string, kind: Area = "local"): void {
  try {
    area(kind)?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  savedBooks: "libria:savedBooks",
  preferences: "libria:preferences",
  discoveryStep: "libria:discoveryStep",
  recentSearches: "libria:recentSearches",
  feedback: "libria:feedback",
  results: "libria:results",
} as const;
