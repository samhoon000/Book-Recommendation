import type { Book } from "@/types/book";
import { uniq } from "./validate";

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .split(/[:;]/)[0]
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function authorKey(book: Book): string {
  const last = book.authors[0]?.toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, "").trim().split(/\s+/).pop();
  return last ?? "";
}

export function bookKey(book: Book): string {
  return `${normalizeTitle(book.title)}|${authorKey(book)}`;
}

/** Fill gaps in `primary` with data from `secondary`, never overwriting existing values. */
export function mergeBooks(primary: Book, secondary: Book): Book {
  return {
    ...primary,
    subtitle: primary.subtitle ?? secondary.subtitle,
    authors: primary.authors.length ? primary.authors : secondary.authors,
    description: primary.description ?? secondary.description,
    coverUrl: primary.coverUrl ?? secondary.coverUrl,
    coverUrlLarge: primary.coverUrlLarge ?? secondary.coverUrlLarge,
    publishedYear: primary.publishedYear ?? secondary.publishedYear,
    publisher: primary.publisher ?? secondary.publisher,
    isbn: primary.isbn ?? secondary.isbn,
    pageCount: primary.pageCount ?? secondary.pageCount,
    subjects: uniq([...primary.subjects, ...secondary.subjects]),
    categories: uniq([...primary.categories, ...secondary.categories]),
    rating: primary.rating ?? secondary.rating,
    readerCount: primary.readerCount ?? secondary.readerCount,
    firstSentence: primary.firstSentence ?? secondary.firstSentence,
    seriesVolume: primary.seriesVolume ?? secondary.seriesVolume,
  };
}

/**
 * Collapse duplicates that arrive from several queries or several APIs.
 * Matches on work id, ISBN, or normalized title + author surname. Open Library records win ties.
 */
export function dedupeBooks(books: Book[]): Book[] {
  const byKey = new Map<string, Book>();
  const alias = new Map<string, string>();

  for (const book of books) {
    const keys = [`id:${book.id}`, book.isbn ? `isbn:${book.isbn}` : "", `t:${bookKey(book)}`].filter(Boolean);
    const existingKey = keys.map((k) => alias.get(k)).find((k): k is string => !!k);
    if (existingKey) {
      const existing = byKey.get(existingKey)!;
      const merged = existing.source === "openlibrary" || book.source !== "openlibrary" ? mergeBooks(existing, book) : mergeBooks(book, existing);
      byKey.set(existingKey, merged);
      for (const k of keys) alias.set(k, existingKey);
    } else {
      const canonical = keys[0];
      byKey.set(canonical, book);
      for (const k of keys) alias.set(k, canonical);
    }
  }
  return Array.from(byKey.values());
}
