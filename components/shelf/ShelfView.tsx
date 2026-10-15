"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Sparkles, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { SHELF_LISTS, type ShelfEntry, type ShelfList } from "@/lib/storage/shelf";
import { useShelf } from "@/components/providers/ShelfProvider";
import { useBookModal } from "@/components/providers/BookModalProvider";
import { BookCover } from "@/components/books/BookCover";
import { EmptyState } from "@/components/ui/States";

export function ShelfView() {
  const { entries } = useShelf();
  const [tab, setTab] = useState<ShelfList>("want");
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const counts = Object.fromEntries(SHELF_LISTS.map((l) => [l.id, entries.filter((e) => e.list === l.id).length])) as Record<ShelfList, number>;
  const current = entries.filter((e) => e.list === tab);

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = SHELF_LISTS.findIndex((l) => l.id === tab);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = SHELF_LISTS[(i + (e.key === "ArrowRight" ? 1 : -1) + SHELF_LISTS.length) % SHELF_LISTS.length];
      setTab(next.id);
      document.getElementById(`tab-${next.id}`)?.focus();
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-32 pt-28 md:px-8 md:pt-36">
      <h1 className="display-xl">My Shelf</h1>
      <p className="mt-5 max-w-[50ch] text-lg text-parchment">Saved in this browser. Move books between lists as your plans change.</p>

      {!mounted ? (
        <div className="h-64" />
      ) : entries.length === 0 ? (
        <EmptyState title="Your shelf is empty." body="There are thousands of stories waiting for you." action={{ href: "/discover", label: "Discover a book →" }} />
      ) : (
        <>
          <div role="tablist" aria-label="Shelf lists" onKeyDown={onTabKey} className="mt-12 flex gap-1 overflow-x-auto border-b border-rule">
            {SHELF_LISTS.map((l) => (
              <button
                key={l.id}
                id={`tab-${l.id}`}
                role="tab"
                type="button"
                aria-selected={tab === l.id}
                aria-controls={`panel-${l.id}`}
                tabIndex={tab === l.id ? 0 : -1}
                onClick={() => setTab(l.id)}
                className={`relative shrink-0 px-3 pb-4 pt-2 font-display text-xl md:px-4 md:text-2xl transition-colors ${tab === l.id ? "text-vellum" : "text-dim hover:text-parchment"}`}
              >
                {l.label}
                <span className="ml-2 font-sans text-sm tabular-nums text-parchment">{counts[l.id]}</span>
                {tab === l.id && <motion.span layoutId="shelf-tab" className="absolute inset-x-2 -bottom-px h-[2px] bg-lamp" />}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pt-12">
            {current.length === 0 ? (
              <p className="py-16 text-center text-parchment">{SHELF_LISTS.find((l) => l.id === tab)?.empty}</p>
            ) : (
              <motion.ul layout className="grid grid-cols-2 gap-x-6 gap-y-14 sm:grid-cols-3 lg:grid-cols-5">
                <AnimatePresence mode="popLayout">
                  {current.map((entry) => (
                    <ShelfItem key={entry.book.id} entry={entry} />
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ShelfItem({ entry }: { entry: ShelfEntry }) {
  const reduce = useReducedMotion();
  const { move, remove } = useShelf();
  const { openBook } = useBookModal();
  const { book } = entry;
  return (
    <motion.li
      layout
      initial={reduce ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, rotate: -4, transition: { duration: 0.25 } }}
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
      className="group flex flex-col"
    >
      <button type="button" onClick={() => openBook(book)} className="relative block text-left" aria-label={`Open ${book.title}`}>
        <div className="transition-transform duration-500 ease-[cubic-bezier(0.22,1.2,0.36,1)] group-hover:-translate-y-2">
          <BookCover book={book} size="fill" decorative />
        </div>
        <div className="relative z-10 h-2 bg-[linear-gradient(180deg,#3a2c1f,#231a12)]" aria-hidden />
      </button>
      <p className="mt-3 line-clamp-2 font-display text-xl leading-tight text-vellum">{book.title}</p>
      <p className="line-clamp-1 text-sm text-parchment">{book.authors[0]}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1">
        <label className="sr-only" htmlFor={`move-${book.id}`}>
          Move {book.title} to
        </label>
        <select
          id={`move-${book.id}`}
          value={entry.list}
          onChange={(e) => move(book.id, e.target.value as ShelfList)}
          className="max-w-full rounded-full border border-rule bg-umber px-3 py-1.5 text-xs text-vellum focus:border-lamp"
        >
          {SHELF_LISTS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <Link
          href={`/explore?like=${encodeURIComponent(book.id)}&title=${encodeURIComponent(book.title)}#if-you-liked`}
          aria-label={`Find books like ${book.title}`}
          title="More like this"
          className="grid size-8 place-items-center rounded-full text-parchment transition hover:bg-shelf hover:text-lamp"
        >
          <Sparkles className="size-4" aria-hidden />
        </Link>
        <button type="button" onClick={() => remove(book.id)} aria-label={`Remove ${book.title}`} title="Remove" className="grid size-8 place-items-center rounded-full text-parchment transition hover:bg-shelf hover:text-vellum">
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </motion.li>
  );
}
