"use client";

import { useEffect, useState } from "react";
import type { BookSummary } from "@/types/book";
import { ApiError, searchBooks } from "@/lib/api/client";

export type SearchStatus = "idle" | "loading" | "done" | "error";

/** Debounced, cancellable autocomplete against /api/search. */
export function useBookSearch(query: string, delay = 280) {
  const [results, setResults] = useState<BookSummary[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [error, setError] = useState<string>();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setResults([]);
      setStatus("idle");
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    const t = window.setTimeout(() => {
      searchBooks(q, controller.signal)
        .then((r) => {
          setResults(r);
          setStatus("done");
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof ApiError ? err.message : "Search failed.");
          setStatus("error");
        });
    }, delay);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [query, delay]);

  return { results, status, error };
}
