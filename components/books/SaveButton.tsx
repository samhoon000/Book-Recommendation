"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import type { Book } from "@/types/book";
import type { ShelfBook } from "@/lib/storage/shelf";
import { useShelf } from "@/components/providers/ShelfProvider";

/** Bookmark toggle with a small "ribbon drop" when saved. */
export function SaveButton({ book, variant = "icon" }: { book: Book | ShelfBook; variant?: "icon" | "full" }) {
  const { listOf, toggle } = useShelf();
  const saved = !!listOf(book.id);
  const label = saved ? `Remove ${book.title} from your shelf` : `Save ${book.title} to your shelf`;

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={() => toggle(book)}
        aria-pressed={saved}
        className={`group inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition active:scale-[0.98] ${
          saved ? "bg-shelf text-lamp ring-1 ring-lamp/50" : "bg-lamp text-ink hover:bg-[#ebb95a]"
        }`}
      >
        <Ribbon saved={saved} />
        {saved ? "On your shelf" : "Save to My List"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => toggle(book)}
      aria-pressed={saved}
      aria-label={label}
      title={saved ? "Saved" : "Save"}
      className={`grid size-10 place-items-center rounded-full transition active:scale-90 ${saved ? "bg-lamp/15 text-lamp" : "text-parchment hover:bg-shelf hover:text-vellum"}`}
    >
      <Ribbon saved={saved} />
    </button>
  );
}

function Ribbon({ saved }: { saved: boolean }) {
  return (
    <span className="relative grid size-5 place-items-center" aria-hidden>
      <AnimatePresence initial={false} mode="popLayout">
        {saved ? (
          <motion.span
            key="on"
            initial={{ y: -10, scale: 0.6, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 18 }}
          >
            <BookmarkCheck className="size-5" />
          </motion.span>
        ) : (
          <motion.span key="off" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
            <Bookmark className="size-5" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
