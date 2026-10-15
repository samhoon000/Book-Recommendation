"use client";

import { Loader2, Search } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { BookSummary } from "@/types/book";
import { useBookSearch } from "@/hooks/useBookSearch";
import { BookCover } from "@/components/books/BookCover";

interface BookSearchFieldProps {
  label: string;
  placeholder?: string;
  onSelect: (book: BookSummary) => void;
  /** Ids to mark as already chosen. */
  selectedIds?: string[];
  autoFocus?: boolean;
  size?: "md" | "lg";
  /** Visually hide the label (it is still announced). */
  hideLabel?: boolean;
}

/** Accessible combobox: arrow keys move through results, Enter picks, Escape closes. */
export function BookSearchField({ label, placeholder = "Search for a book...", onSelect, selectedIds = [], autoFocus, size = "md", hideLabel }: BookSearchFieldProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, status, error } = useBookSearch(query);
  const showList = open && query.trim().length >= 2;

  const choose = (book: BookSummary) => {
    onSelect(book);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showList || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "mb-2 block text-sm text-parchment"}>
        {label}
      </label>
      <div className={`flex items-center gap-3 border-b border-rule transition-colors focus-within:border-lamp ${size === "lg" ? "pb-3" : "pb-2"}`}>
        <Search className="size-5 shrink-0 text-dim" aria-hidden />
        <input
          ref={inputRef}
          id={id}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          data-autofocus={autoFocus || undefined}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className={`w-full bg-transparent text-vellum placeholder:text-dim focus:outline-none [&::-webkit-search-cancel-button]:hidden ${
            size === "lg" ? "font-display text-3xl md:text-4xl" : "text-lg"
          }`}
        />
        {status === "loading" && <Loader2 className="size-5 shrink-0 animate-spin text-lamp" aria-label="Searching" />}
      </div>

      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={`${label} results`}
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-[min(420px,60dvh)] overflow-y-auto rounded-md border border-rule bg-umber p-1.5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)]"
        >
          {status === "error" && <li className="px-3 py-4 text-sm text-parchment">{error ?? "Search failed."} Try again in a moment.</li>}
          {status === "done" && results.length === 0 && <li className="px-3 py-4 text-sm text-parchment">No books found for “{query}”. Try a title or an author.</li>}
          {status === "loading" && results.length === 0 &&
            Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2" aria-hidden>
                <div className="shimmer h-12 w-8 rounded-sm" />
                <div className="flex-1 space-y-2">
                  <div className="shimmer h-3 w-2/3 rounded" />
                  <div className="shimmer h-2.5 w-1/3 rounded" />
                </div>
              </li>
            ))}
          {results.map((b, i) => {
            const picked = selectedIds.includes(b.id);
            return (
              <li
                key={b.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(b)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 rounded px-3 py-2 ${i === active ? "bg-shelf" : ""}`}
              >
                <BookCover book={b} size="xs" decorative />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-vellum">{b.title}</p>
                  <p className="truncate text-sm text-parchment">
                    {b.authors.slice(0, 2).join(", ")}
                    {b.publishedYear ? `, ${b.publishedYear}` : ""}
                  </p>
                </div>
                {picked && <span className="text-xs text-lamp">Added</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
