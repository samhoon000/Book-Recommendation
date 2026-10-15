import type { Book } from "@/types/book";
import { KEYS, readJson, writeJson } from "./storage";

export type ShelfList = "want" | "favorites" | "later";

export const SHELF_LISTS: Array<{ id: ShelfList; label: string; empty: string }> = [
  { id: "want", label: "Want to Read", empty: "Books you save land here first." },
  { id: "favorites", label: "Favorites", empty: "Move the ones you loved here." },
  { id: "later", label: "Maybe Later", empty: "Somewhere to park a maybe." },
];

/** The minimal book snapshot we keep locally, enough to render a cover card offline. */
export type ShelfBook = Pick<Book, "id" | "title" | "authors" | "coverUrl" | "coverUrlLarge" | "publishedYear" | "pageCount">;

export interface ShelfEntry {
  book: ShelfBook;
  list: ShelfList;
  addedAt: number;
}

/**
 * Storage-agnostic shelf contract. The MVP uses the browser; a signed-in version can
 * implement the same interface against an API without touching components.
 */
export interface ShelfRepository {
  all(): ShelfEntry[];
  save(book: ShelfBook, list?: ShelfList): ShelfEntry[];
  move(bookId: string, list: ShelfList): ShelfEntry[];
  remove(bookId: string): ShelfEntry[];
  subscribe(listener: () => void): () => void;
}

const LISTS = new Set<ShelfList>(["want", "favorites", "later"]);

function validate(v: unknown): ShelfEntry[] {
  if (!Array.isArray(v)) return [];
  return v.filter((e): e is ShelfEntry => {
    if (typeof e !== "object" || e === null) return false;
    const entry = e as Partial<ShelfEntry>;
    return !!entry.book && typeof entry.book.id === "string" && typeof entry.book.title === "string" && LISTS.has(entry.list as ShelfList);
  });
}

export function snapshot(book: Book | ShelfBook): ShelfBook {
  return {
    id: book.id,
    title: book.title,
    authors: book.authors.slice(0, 3),
    coverUrl: book.coverUrl,
    coverUrlLarge: book.coverUrlLarge,
    publishedYear: book.publishedYear,
    pageCount: book.pageCount,
  };
}

export function createLocalShelf(): ShelfRepository {
  let entries: ShelfEntry[] | undefined;
  const listeners = new Set<() => void>();

  const load = () => (entries ??= readJson(KEYS.savedBooks, [], "local", validate));
  const commit = (next: ShelfEntry[]) => {
    entries = next;
    writeJson(KEYS.savedBooks, next);
    listeners.forEach((l) => l());
    return next;
  };

  if (typeof window !== "undefined") {
    // Keep several open tabs in sync.
    window.addEventListener("storage", (e) => {
      if (e.key === KEYS.savedBooks) {
        entries = undefined;
        listeners.forEach((l) => l());
      }
    });
  }

  return {
    all: load,
    save(book, list = "want") {
      const current = load().filter((e) => e.book.id !== book.id);
      return commit([{ book: snapshot(book), list, addedAt: Date.now() }, ...current]);
    },
    move(bookId, list) {
      return commit(load().map((e) => (e.book.id === bookId ? { ...e, list } : e)));
    },
    remove(bookId) {
      return commit(load().filter((e) => e.book.id !== bookId));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
