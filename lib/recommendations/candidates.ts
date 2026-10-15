import "server-only";
import type { Book } from "@/types/book";
import { dedupeBooks } from "@/lib/api/dedupe";
import { isUsableBook, LibraryUnavailableError, searchBooks } from "@/lib/api/bookSearch";
import { searchGoogleBooks } from "@/lib/api/googleBooks";
import { mapSettled } from "@/lib/api/http";
import { applyEnglishEdition, applyWorkDetails, getOpenLibraryEnglishEdition, getOpenLibraryWork, searchOpenLibrary } from "@/lib/api/openLibrary";
import { getBook } from "@/lib/api/bookSearch";
import type { PlannedQuery } from "./retrieval";
import type { RetrievalQueryDebug } from "./types";

/**
 * Candidate retrieval: runs the planned queries with bounded parallelism, records which route
 * surfaced each book, merges, de-duplicates and drops unusable records.
 * Throws LibraryUnavailableError only when every route failed.
 */

export interface RetrievedPool {
  books: Book[];
  /** Which routes surfaced each (deduplicated) book. */
  routes: Map<string, string[]>;
  queries: RetrievalQueryDebug[];
}

export async function retrieveCandidates(plan: PlannedQuery[]): Promise<RetrievedPool> {
  const debug: RetrievalQueryDebug[] = [];
  let failures = 0;
  const results = await mapSettled(plan, 4, async (query) => {
    const t = Date.now();
    try {
      const res = await searchOpenLibrary({ q: query.q, sort: query.sort, limit: query.limit });
      debug.push({ route: query.route, q: query.q, sort: query.sort, limit: query.limit, returned: res.books.length, ms: Date.now() - t });
      return { route: query.route, books: res.books };
    } catch (err) {
      failures++;
      debug.push({ route: query.route, q: query.q, sort: query.sort, limit: query.limit, returned: 0, ms: Date.now() - t, failed: true });
      throw err;
    }
  });

  const raw: Array<{ route: string; books: Book[] }> = results.flatMap((r) => (r ? [r] : []));
  let pool = raw.flatMap((r) => r.books);

  // Fallback: Open Library failed or returned too little to rank meaningfully.
  if (pool.length < 12) {
    const texts = plan.map((q) => q.fallbackText).filter((t): t is string => !!t).slice(0, 3);
    const google = await mapSettled(texts, 2, async (t) => {
      const started = Date.now();
      const books = await searchGoogleBooks(t, 20);
      debug.push({ route: "google-fallback", q: t, limit: 20, returned: books.length, ms: Date.now() - started });
      return books;
    });
    for (const g of google) if (g) raw.push({ route: "google-fallback", books: g });
    pool = pool.concat(google.flatMap((r) => r ?? []));
  }
  if (pool.length === 0 && failures === plan.length && plan.length > 0) throw new LibraryUnavailableError();

  const deduped = dedupeBooks(pool).filter(isUsableBook);
  // Routes are keyed by every id/title alias that collapsed into the deduplicated record.
  const routeByRaw = new Map<string, Set<string>>();
  for (const r of raw) for (const b of r.books) {
    const key = b.id;
    if (!routeByRaw.has(key)) routeByRaw.set(key, new Set());
    routeByRaw.get(key)!.add(r.route);
  }
  const routes = new Map<string, string[]>();
  for (const b of deduped) routes.set(b.id, Array.from(routeByRaw.get(b.id) ?? []));
  return { books: deduped, routes, queries: debug };
}

/**
 * Add descriptions and full subject lists to the most promising candidates, and settle their English
 * titles, but never let a slow catalog hold the request: whatever has not arrived by the budget is
 * used as it was (the lookups keep running in the background and land in the cache for the next request).
 */
export async function enrichWithBudget(books: Book[], budgetMs: number, concurrency = 4): Promise<Book[]> {
  const out = [...books];
  const work = (async () => {
    // Descriptions first (they drive scoring); the English titles fill whatever budget is left, and the
    // shown picks get a second chance after ranking (withEnglishTitles).
    await mapSettled(books, concurrency, async (book, i) => {
      if (book.source !== "openlibrary" || book.description) return;
      const details = await getOpenLibraryWork(book.sourceId);
      out[i] = applyWorkDetails(out[i], details);
    });
    await mapSettled(books, concurrency, async (book, i) => {
      if (book.source !== "openlibrary") return;
      out[i] = applyEnglishEdition(out[i], await getOpenLibraryEnglishEdition(book.sourceId));
    });
  })();
  await Promise.race([work, new Promise<void>((r) => setTimeout(r, budgetMs))]);
  return [...out];
}

/**
 * Settle the English title of the books that will actually be shown. Books that went through
 * enrichWithBudget are cache hits; the rest (exploration picks, reserve) get one cached catalog call each.
 */
export async function withEnglishTitles(books: Book[], budgetMs: number, concurrency = 4): Promise<Book[]> {
  const out = [...books];
  const titles = mapSettled(books, concurrency, async (book, i) => {
    if (book.source !== "openlibrary") return;
    out[i] = applyEnglishEdition(out[i], await getOpenLibraryEnglishEdition(book.sourceId));
  });
  await Promise.race([titles, new Promise<void>((r) => setTimeout(r, budgetMs))]);
  return [...out];
}

/** Resolve a free-text reference ("like Black Mirror") to a catalog record, when one plausibly exists. */
export async function resolveReference(text: string): Promise<Book | undefined> {
  try {
    const hits = await searchBooks(text, 3);
    const normalized = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const hit = hits.find((h) => {
      const t = h.title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      return t === normalized || t.startsWith(normalized) || normalized.startsWith(t);
    });
    if (!hit) return undefined;
    return (await getBook(hit.id)) ?? undefined;
  } catch {
    return undefined;
  }
}
