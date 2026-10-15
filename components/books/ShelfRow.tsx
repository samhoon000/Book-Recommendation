"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type ReactNode } from "react";
import type { ScoredBook } from "@/lib/recommendations/types";
import { useBookModal } from "@/components/providers/BookModalProvider";
import { BookCover } from "./BookCover";
import { CoverSkeleton, LineSkeleton } from "@/components/ui/States";

interface ShelfRowProps {
  items: ScoredBook[] | undefined;
  /** Optional line under each book (e.g. why it's related). */
  caption?: (sb: ScoredBook) => ReactNode;
  label: string;
  skeletonCount?: number;
}

/**
 * Books standing on a plank, scrolled sideways. Hover lifts a cover; click opens details.
 * Arrow buttons page the row on desktop; touch users swipe.
 */
export function ShelfRow({ items, caption, label, skeletonCount = 6 }: ShelfRowProps) {
  const { openBook } = useBookModal();
  const scroller = useRef<HTMLUListElement>(null);
  const page = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div className="group/row relative">
      <ul ref={scroller} aria-label={label} className="shelf-scroll -mx-4 flex gap-6 overflow-x-auto px-4 pb-2 pt-4 md:-mx-8 md:gap-8 md:px-8">
        {items
          ? items.map((sb) => (
              <li key={sb.book.id} className="w-[132px] shrink-0 md:w-[156px]">
                <button
                  type="button"
                  onClick={() => openBook(sb.book)}
                  className="group block w-full text-left"
                  aria-label={`${sb.book.title} by ${sb.book.authors[0] ?? "unknown author"}`}
                >
                  <div className="relative">
                    <div className="transition-transform duration-500 ease-[cubic-bezier(0.22,1.2,0.36,1)] group-hover:-translate-y-2 group-hover:-rotate-1 group-focus-visible:-translate-y-2">
                      <BookCover book={sb.book} size="fill" decorative />
                    </div>
                    {/* contact shadow on the plank */}
                    <div className="absolute -bottom-2 left-1 right-1 h-3 rounded-[50%] bg-black/70 blur-md transition-opacity group-hover:opacity-60" aria-hidden />
                  </div>
                  <div className="relative z-10 mt-0 h-2 bg-[linear-gradient(180deg,#3a2c1f,#231a12)] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.9)]" aria-hidden />
                  <p className="mt-3 line-clamp-2 font-display text-lg leading-tight text-vellum">{sb.book.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-sm text-parchment">{sb.book.authors[0]}</p>
                  {caption && <div className="mt-1.5 text-xs leading-snug text-dim">{caption(sb)}</div>}
                </button>
              </li>
            ))
          : Array.from({ length: skeletonCount }, (_, i) => (
              <li key={i} className="w-[132px] shrink-0 space-y-3 md:w-[156px]">
                <CoverSkeleton className="w-full" />
                <LineSkeleton className="w-4/5" />
                <LineSkeleton className="w-1/2" />
              </li>
            ))}
      </ul>
      <div className="pointer-events-none absolute inset-y-0 -right-8 hidden w-24 bg-gradient-to-l from-ink to-transparent md:block" aria-hidden />
      {items && items.length > 4 && (
        <div className="absolute -top-14 right-0 hidden gap-2 md:flex">
          <button type="button" onClick={() => page(-1)} aria-label={`Scroll ${label} left`} className="grid size-10 place-items-center rounded-full border border-rule text-parchment transition hover:border-lamp/60 hover:text-lamp">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" onClick={() => page(1)} aria-label={`Scroll ${label} right`} className="grid size-10 place-items-center rounded-full border border-rule text-parchment transition hover:border-lamp/60 hover:text-lamp">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
