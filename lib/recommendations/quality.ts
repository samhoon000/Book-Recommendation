import type { Book } from "@/types/book";
import type { Signals } from "./types";

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/**
 * Metadata completeness, separate from popularity. A record with a description, cover,
 * subjects and publication details is one the engine can actually reason about.
 * Missing fields cost a little each; nothing here can sink an otherwise excellent book.
 */
export function metadataQuality(book: Book): { score: number; missing: string[] } {
  const missing: string[] = [];
  let score = 1;
  if (!book.description) {
    score -= 0.22;
    missing.push("description");
  }
  if (!book.coverUrl) {
    score -= 0.16;
    missing.push("cover");
  }
  const subjectCount = book.subjects.length + book.categories.length;
  if (subjectCount === 0) {
    score -= 0.24;
    missing.push("subjects");
  } else if (subjectCount < 4) {
    score -= 0.1;
    missing.push("few subjects");
  }
  if (!book.publishedYear) {
    score -= 0.08;
    missing.push("publication year");
  }
  if (!book.pageCount) {
    score -= 0.06;
    missing.push("page count");
  }
  if (!book.isbn) {
    score -= 0.04;
    missing.push("ISBN");
  }
  if (!book.rating && !book.readerCount) {
    score -= 0.06;
    missing.push("reader data");
  }
  return { score: clamp(score), missing };
}

/** Raw reader-interest count behind the popularity signal. Undefined when the source gave none. */
export function readerInterest(book: Book): number | undefined {
  const readers = book.readerCount;
  const ratings = book.rating?.count;
  if (readers === undefined && ratings === undefined) return undefined;
  return (readers ?? 0) + (ratings ?? 0);
}

/**
 * A modest quality signal: ratings pulled toward a prior, and popularity as a small, log-scaled nudge.
 * Popularity is never the main ranking factor; the "hidden" mode even inverts it.
 */
export function qualityScore(book: Book, mode: Signals["qualityMode"]): number {
  const count = book.rating?.count ?? 0;
  const avg = book.rating?.average ?? 0;
  const bayes = (avg * count + 3.7 * 12) / (count + 12);
  const rating = count ? clamp((bayes - 3.2) / 1.35) : 0.42;
  const popularity = clamp(Math.log10((readerInterest(book) ?? 0) + 1) / 4.2);
  if (mode === "hidden") return clamp(0.8 * rating + 0.2 * (1 - popularity));
  if (mode === "popular") return clamp(0.4 * rating + 0.6 * popularity);
  return clamp(0.72 * rating + 0.28 * popularity);
}

/** Popularity percentile of each book inside a pool (0 = least known). Books without reader data get undefined. */
export function popularityPercentiles(books: Book[]): Map<string, number> {
  const known = books.map((b) => ({ id: b.id, n: readerInterest(b) })).filter((x): x is { id: string; n: number } => x.n !== undefined);
  known.sort((a, b) => a.n - b.n);
  const out = new Map<string, number>();
  known.forEach((x, i) => out.set(x.id, known.length > 1 ? i / (known.length - 1) : 0.5));
  return out;
}
