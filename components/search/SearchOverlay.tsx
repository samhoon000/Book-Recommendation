"use client";

import { Clock } from "lucide-react";
import { useState } from "react";
import type { BookSummary } from "@/types/book";
import { Sheet } from "@/components/ui/Sheet";
import { BookCover } from "@/components/books/BookCover";
import { useBookModal } from "@/components/providers/BookModalProvider";
import { KEYS, readJson, writeJson } from "@/lib/storage/storage";
import { BookSearchField } from "./BookSearchField";

function validRecent(v: unknown): BookSummary[] {
  return Array.isArray(v) ? v.filter((b): b is BookSummary => typeof b?.id === "string" && typeof b?.title === "string" && Array.isArray(b?.authors)).slice(0, 6) : [];
}

/** Global search by title, author or subject. Results open the book detail sheet. */
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openBook } = useBookModal();
  const [recent, setRecent] = useState<BookSummary[]>(() => readJson(KEYS.recentSearches, [], "local", validRecent));

  const pick = (book: BookSummary) => {
    const next = [book, ...recent.filter((r) => r.id !== book.id)].slice(0, 6);
    setRecent(next);
    writeJson(KEYS.recentSearches, next);
    onClose();
    window.setTimeout(() => openBook(book), 120);
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy="search-title" variant="compact">
      <div className="px-5 pb-8 pt-14 md:px-8 md:pt-10">
        <h2 id="search-title" className="display-md mb-6">
          Search the library
        </h2>
        <BookSearchField label="Search by title, author or subject" hideLabel placeholder="Title, author or subject" onSelect={pick} autoFocus size="lg" />
        {recent.length > 0 && (
          <div className="mt-8">
            <p className="mb-3 flex items-center gap-2 text-sm text-dim">
              <Clock className="size-4" aria-hidden /> Recently opened
            </p>
            <ul className="space-y-1">
              {recent.map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => pick(b)} className="flex w-full items-center gap-3 rounded px-2 py-2 text-left transition hover:bg-shelf">
                    <BookCover book={b} size="xs" decorative />
                    <span className="min-w-0">
                      <span className="block truncate text-vellum">{b.title}</span>
                      <span className="block truncate text-sm text-parchment">{b.authors[0]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
