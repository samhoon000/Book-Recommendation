import "server-only";
import type { Book, BookSummary } from "@/types/book";
import { dedupeBooks, mergeBooks } from "./dedupe";
import { findGoogleMatch, getGoogleVolume, searchGoogleBooks } from "./googleBooks";
import { mapSettled, UpstreamError } from "./http";
import {
  applyEnglishEdition,
  applyWorkDetails,
  getOpenLibraryEnglishEdition,
  getOpenLibrarySearchDoc,
  getOpenLibraryWork,
  searchOpenLibrary,
  type OpenLibrarySort,
} from "./openLibrary";

/**
 * The single entry point the rest of the server uses for book data.
 * Strategy: Open Library → (if insufficient) Google Books → normalize → dedupe.
 */

export class LibraryUnavailableError extends Error {
  constructor() {
    super("The book catalog could not be reached.");
    this.name = "LibraryUnavailableError";
  }
}

export function toSummary(book: Book): BookSummary {
  return { id: book.id, title: book.title, authors: book.authors, coverUrl: book.coverUrl, publishedYear: book.publishedYear };
}

const JUNK_TITLE =
  /\b(summary|study guide|sparknotes|cliffs ?notes|workbook|analysis of|unofficial|companion to|coloring book|quiz ?book|trivia|box(ed)? set|collection set|books? \d+\s*[-–]\s*\d+|omnibus|novels? \(|complete works|calendar|journal|notebook|lesson plans?|vol(ume)?\.? ?\d+)\b/i;

const STUDY_AID = /\b(critical commentary|monarch notes|barron'?s|york notes|reader'?s guide|teacher'?s guide|study notes|literature guide)\b/i;

export function isUsableBook(book: Book): boolean {
  const slashParts = book.title.split(" / ");
  const omnibus = slashParts.length >= 3 || (slashParts.length === 2 && slashParts.every((p) => p.trim().length >= 4));
  return book.authors.length > 0 && book.title.length < 160 && !omnibus && !JUNK_TITLE.test(book.title) && !STUDY_AID.test(`${book.title} ${book.subtitle ?? ""}`);
}

/** Autocomplete / global search by title, author or subject. */
export async function searchBooks(query: string, limit = 8): Promise<BookSummary[]> {
  const q = query.trim().slice(0, 120);
  if (q.length < 2) return [];
  let books: Book[] = [];
  let olFailed = false;
  try {
    const res = await searchOpenLibrary({ q, limit: limit + 4, summary: true, ttlMs: 3600_000 });
    books = res.books;
  } catch {
    olFailed = true;
  }
  if (books.length < 3) {
    const google = await searchGoogleBooks(q, limit);
    books = dedupeBooks([...books, ...google]);
  }
  if (olFailed && books.length === 0) throw new LibraryUnavailableError();
  return books.filter(isUsableBook).slice(0, limit).map(toSummary);
}

/** Full details for one book from any source, enriched with descriptions and gap-filling. */
export async function getBook(id: string): Promise<Book | undefined> {
  if (id.startsWith("gb-")) return getGoogleVolume(id.slice(3));
  if (!/^OL\d+W$/.test(id)) return undefined;

  let doc: Book | undefined;
  let work: Awaited<ReturnType<typeof getOpenLibraryWork>>;
  let english: Awaited<ReturnType<typeof getOpenLibraryEnglishEdition>>;
  try {
    [doc, work, english] = await Promise.all([
      getOpenLibrarySearchDoc(id),
      getOpenLibraryWork(id).catch(() => undefined),
      getOpenLibraryEnglishEdition(id).catch(() => undefined),
    ]);
  } catch (err) {
    if (err instanceof UpstreamError) throw new LibraryUnavailableError();
    throw err;
  }
  if (!doc && work?.title) {
    // Not in the search index yet; build a minimal record from the work itself.
    doc = {
      id: work.workId,
      title: work.title,
      authors: [],
      subjects: [],
      categories: [],
      source: "openlibrary",
      sourceId: work.workId,
      sourceUrl: `https://openlibrary.org/works/${work.workId}`,
    };
  }
  if (!doc) return undefined;
  let book = applyEnglishEdition(applyWorkDetails(doc, work), english);
  if (!book.description || !book.pageCount) {
    const google = await withTimeout(findGoogleMatch(book), 3500);
    if (google) book = mergeBooks(book, { ...google, coverUrl: undefined, coverUrlLarge: undefined });
  }
  return book;
}

export interface CandidateQuery {
  q: string;
  sort?: OpenLibrarySort;
  limit?: number;
  /** Plain-text version used if Open Library fails and Google Books is asked instead. */
  fallbackText?: string;
}

/**
 * Run a small set of structured queries in parallel and return a deduplicated candidate pool.
 * Throws LibraryUnavailableError only when every source failed.
 */
export async function fetchCandidates(queries: CandidateQuery[]): Promise<Book[]> {
  let failures = 0;
  const results = await mapSettled(queries, 4, async (query) => {
    try {
      const res = await searchOpenLibrary({ q: query.q, sort: query.sort, limit: query.limit ?? 30 });
      return res.books;
    } catch (err) {
      failures++;
      throw err;
    }
  });
  let pool = results.flatMap((r) => r ?? []);

  // Fallback: Open Library failed or returned too little to rank meaningfully.
  if (pool.length < 12) {
    const texts = queries.map((q) => q.fallbackText).filter((t): t is string => !!t).slice(0, 3);
    const google = await mapSettled(texts, 2, (t) => searchGoogleBooks(t, 20));
    pool = pool.concat(google.flatMap((r) => r ?? []));
  }
  if (pool.length === 0 && failures === queries.length && queries.length > 0) throw new LibraryUnavailableError();
  return dedupeBooks(pool).filter(isUsableBook);
}

/** Add descriptions and full subject lists to the books that will actually be shown. */
export async function enrichBooks(books: Book[], concurrency = 4): Promise<Book[]> {
  const enriched = await mapSettled(books, concurrency, async (book) => {
    if (book.source !== "openlibrary") return book;
    const [work, english] = await Promise.all([
      book.description ? undefined : getOpenLibraryWork(book.sourceId),
      getOpenLibraryEnglishEdition(book.sourceId).catch(() => undefined),
    ]);
    return applyEnglishEdition(applyWorkDetails(book, work), english);
  });
  return enriched.map((b, i) => b ?? books[i]);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise.catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
}
