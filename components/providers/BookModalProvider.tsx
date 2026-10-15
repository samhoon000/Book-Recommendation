"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Book } from "@/types/book";
import type { ScoredBook } from "@/lib/recommendations/types";
import { Sheet } from "@/components/ui/Sheet";
import { BookDetail } from "@/components/books/BookDetail";

type BookLike = Pick<Book, "id" | "title" | "authors"> & Partial<Book>;

interface OpenOptions {
  scored?: ScoredBook;
  broad?: boolean;
  onNotInterested?: () => void;
}

interface BookModalApi {
  openBook: (book: BookLike, opts?: OpenOptions) => void;
  close: () => void;
}

const BookModalContext = createContext<BookModalApi | null>(null);

/** One shared detail sheet for the whole app, so any cover anywhere can open a book. */
export function BookModalProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ book: BookLike; opts: OpenOptions; key: number } | null>(null);
  const [open, setOpen] = useState(false);

  const openBook = useCallback((book: BookLike, opts: OpenOptions = {}) => {
    setCurrent({ book, opts, key: Date.now() });
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  const api = useMemo(() => ({ openBook, close }), [openBook, close]);

  return (
    <BookModalContext.Provider value={api}>
      {children}
      <Sheet open={open && !!current} onClose={close} labelledBy="book-detail-title">
        {current && (
          <BookDetail
            key={current.key}
            initial={current.book}
            scored={current.opts.scored}
            broad={current.opts.broad}
            titleId="book-detail-title"
            onNotInterested={
              current.opts.onNotInterested
                ? () => {
                    current.opts.onNotInterested?.();
                    close();
                  }
                : undefined
            }
            onOpenBook={(b) => openBook(b)}
          />
        )}
      </Sheet>
    </BookModalContext.Provider>
  );
}

export function useBookModal(): BookModalApi {
  const ctx = useContext(BookModalContext);
  if (!ctx) throw new Error("useBookModal must be used inside BookModalProvider");
  return ctx;
}
