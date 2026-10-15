"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { Book } from "@/types/book";
import { createLocalShelf, SHELF_LISTS, type ShelfBook, type ShelfEntry, type ShelfList, type ShelfRepository } from "@/lib/storage/shelf";
import { useToast } from "./ToastProvider";

interface ShelfApi {
  entries: ShelfEntry[];
  listOf: (bookId: string) => ShelfList | undefined;
  save: (book: Book | ShelfBook, list?: ShelfList) => void;
  move: (bookId: string, list: ShelfList) => void;
  remove: (bookId: string) => void;
  toggle: (book: Book | ShelfBook) => void;
}

const ShelfContext = createContext<ShelfApi | null>(null);
const EMPTY: ShelfEntry[] = [];

let repo: ShelfRepository | undefined;
const getRepo = () => (repo ??= createLocalShelf());

export function ShelfProvider({ children }: { children: ReactNode }) {
  const { notify } = useToast();
  const entries = useSyncExternalStore(
    (l) => getRepo().subscribe(l),
    () => getRepo().all(),
    () => EMPTY,
  );

  const listOf = useCallback((id: string) => entries.find((e) => e.book.id === id)?.list, [entries]);

  const remove = useCallback(
    (bookId: string) => {
      const entry = getRepo()
        .all()
        .find((e) => e.book.id === bookId);
      getRepo().remove(bookId);
      notify("Removed from your shelf.", {
        icon: "removed",
        action: entry ? { label: "Undo", onClick: () => getRepo().save(entry.book, entry.list) } : undefined,
      });
    },
    [notify],
  );

  const save = useCallback(
    (book: Book | ShelfBook, list: ShelfList = "want") => {
      getRepo().save(book, list);
      notify(list === "want" ? "Saved to your shelf." : `Saved to ${SHELF_LISTS.find((l) => l.id === list)?.label}.`, { icon: "saved" });
    },
    [notify],
  );

  const move = useCallback(
    (bookId: string, list: ShelfList) => {
      getRepo().move(bookId, list);
      notify(`Moved to ${SHELF_LISTS.find((l) => l.id === list)?.label}.`, { icon: "saved" });
    },
    [notify],
  );

  const toggle = useCallback(
    (book: Book | ShelfBook) => {
      if (getRepo()
        .all()
        .some((e) => e.book.id === book.id)) remove(book.id);
      else save(book);
    },
    [remove, save],
  );

  const api = useMemo(() => ({ entries, listOf, save, move, remove, toggle }), [entries, listOf, save, move, remove, toggle]);
  return <ShelfContext.Provider value={api}>{children}</ShelfContext.Provider>;
}

export function useShelf(): ShelfApi {
  const ctx = useContext(ShelfContext);
  if (!ctx) throw new Error("useShelf must be used inside ShelfProvider");
  return ctx;
}
