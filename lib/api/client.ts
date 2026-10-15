"use client";

import type { Book, BookSummary } from "@/types/book";
import type { Preferences } from "@/types/preferences";
import type { RecommendationResult, ScoredBook, SessionContext } from "@/lib/recommendations/types";
import type { ExploreSection, ExploreSectionId } from "@/lib/recommendations/explore";
import type { SurpriseKind, SurpriseResult } from "@/lib/recommendations/surprise";

/**
 * Browser-side access to our own API routes. Components call these, never upstream APIs.
 * GET responses are cached in memory for the session; callers pass an AbortSignal to cancel.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: "unavailable" | "not_found" | "bad_request" | "internal" | "network",
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_MS = 10 * 60 * 1000;

async function request<T>(url: string, init: RequestInit & { cacheable?: boolean } = {}): Promise<T> {
  const { cacheable = true, ...rest } = init;
  const isGet = !rest.method || rest.method === "GET";
  if (isGet && cacheable) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  }
  let res: Response;
  try {
    res = await fetch(url, rest);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("We couldn't reach the library. Check your connection.", "network", 0);
  }
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const e = (body as { error?: { code?: ApiError["code"]; message?: string } } | undefined)?.error;
    throw new ApiError(e?.message ?? "Something went wrong.", e?.code ?? "internal", res.status);
  }
  if (isGet && cacheable) cache.set(url, { at: Date.now(), value: body });
  return body as T;
}

export function searchBooks(q: string, signal?: AbortSignal): Promise<BookSummary[]> {
  return request<{ results: BookSummary[] }>(`/api/search?q=${encodeURIComponent(q)}&limit=8`, { signal }).then((r) => r.results);
}

export function fetchBook(id: string, signal?: AbortSignal): Promise<Book> {
  return request<{ book: Book }>(`/api/book/${encodeURIComponent(id)}`, { signal }).then((r) => r.book);
}

export function fetchRecommendations(preferences: Preferences, signal?: AbortSignal, session?: SessionContext): Promise<RecommendationResult> {
  return request<RecommendationResult>("/api/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ preferences, session }),
    signal,
  });
}

export interface SimilarResponse {
  recommendations: ScoredBook[];
  profileSummary?: string;
}

/**
 * "If you liked X". With the reader's preferences the server blends similarity to the book with their
 * original profile (60/40); without them it centers on the book alone.
 */
export function fetchSimilar(id: string, signal?: AbortSignal, preferences?: Preferences, session?: SessionContext): Promise<ScoredBook[]> {
  return fetchSimilarDetailed(id, signal, preferences, session).then((r) => r.recommendations);
}

export function fetchSimilarDetailed(id: string, signal?: AbortSignal, preferences?: Preferences, session?: SessionContext): Promise<SimilarResponse> {
  const url = `/api/similar/${encodeURIComponent(id)}`;
  if (!preferences) return request<SimilarResponse>(url, { signal });
  return request<SimilarResponse>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ preferences, session }),
    signal,
  });
}

export function fetchExplore(id: ExploreSectionId, signal?: AbortSignal): Promise<ExploreSection> {
  return request<ExploreSection>(`/api/explore/${id}`, { signal });
}

export function fetchSurprise(kind: SurpriseKind, signal?: AbortSignal): Promise<SurpriseResult> {
  const seed = Math.floor(Math.random() * 1_000_000) + 1;
  return request<SurpriseResult>(`/api/surprise?kind=${kind}&seed=${seed}`, { signal, cacheable: false });
}
