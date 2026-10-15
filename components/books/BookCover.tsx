"use client";

/* eslint-disable @next/next/no-img-element -- covers are remote, redirecting, and served at fixed sizes by the provider; next/image adds nothing here. */
import { useCallback, useState } from "react";
import type { Book } from "@/types/book";

type CoverBook = Pick<Book, "title" | "authors"> & Partial<Pick<Book, "coverUrl" | "coverUrlLarge">>;

const SIZES = {
  xs: { w: 44, cls: "w-11" },
  sm: { w: 92, cls: "w-[92px]" },
  md: { w: 150, cls: "w-[150px]" },
  lg: { w: 210, cls: "w-[210px]" },
  xl: { w: 300, cls: "w-[min(300px,62vw)]" },
  fill: { w: 300, cls: "w-full" },
} as const;

export type CoverSize = keyof typeof SIZES;

interface BookCoverProps {
  book: CoverBook;
  size?: CoverSize;
  priority?: boolean;
  className?: string;
  /** Decorative when the title is already announced next to the cover. */
  decorative?: boolean;
}

/** Cloth colors for generated covers, chosen from the title so a book always gets the same one. */
const CLOTH = ["#3d2b24", "#263530", "#2a2f44", "#3b2433", "#37321f", "#2d2a3a", "#40301c", "#22302f"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

export function TypographicCover({ book, compact }: { book: CoverBook; compact?: boolean }) {
  const h = hash(book.title);
  const cloth = CLOTH[h % CLOTH.length];
  const author = book.authors[0] ?? "Unknown author";
  const long = book.title.length > 38;
  return (
    <div
      className="absolute inset-0 flex flex-col justify-between overflow-hidden p-[9%] text-vellum"
      style={{ background: `radial-gradient(120% 90% at 30% 10%, ${cloth} 0%, #15120f 100%)` }}
    >
      <div className="h-px w-1/3 bg-lamp/60" />
      <p
        className={`font-display font-medium leading-[1.02] ${compact ? "text-[11px]" : long ? "text-[clamp(13px,1.15em,22px)]" : "text-[clamp(14px,1.35em,28px)]"}`}
        style={{ textWrap: "balance" }}
      >
        {book.title}
      </p>
      {!compact && (
        <div>
          <div className="mb-2 h-px w-full bg-vellum/15" />
          <p className="text-[clamp(8px,0.62em,12px)] tracking-[0.12em] text-parchment">{author}</p>
        </div>
      )}
    </div>
  );
}

/**
 * The book object: fixed 2:3 frame (no layout shift), lazy image, shimmer while loading,
 * soft blur-up on arrival, and a typographic cover when the provider has nothing.
 */
export function BookCover(props: BookCoverProps) {
  // Remount when the image source changes so load state never sticks to a previous URL.
  return <CoverFrame key={props.book.coverUrl ?? "none"} {...props} />;
}

function CoverFrame({ book, size = "md", priority, className = "", decorative }: BookCoverProps) {
  const [state, setState] = useState<"loading" | "loaded" | "error">(book.coverUrl ? "loading" : "error");
  const { w, cls } = SIZES[size];
  const useLarge = w > 160 && book.coverUrlLarge;
  const src = useLarge ? book.coverUrlLarge : book.coverUrl;
  // Cached images can finish before React attaches onLoad; check completion when the node mounts.
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setState(img.naturalWidth >= 20 ? "loaded" : img.naturalWidth === 0 && img.currentSrc ? "error" : "loading");
  }, []);
  const alt = decorative ? "" : `Cover of ${book.title}${book.authors[0] ? ` by ${book.authors[0]}` : ""}`;

  return (
    <div
      className={`book-shape relative isolate aspect-[2/3] shrink-0 overflow-hidden bg-shelf shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_14px_30px_-14px_rgba(0,0,0,0.9)] ${cls} ${className}`}
      style={{ fontSize: Math.max(10, w / 9) }}
    >
      {state === "loading" && <div className="shimmer absolute inset-0" aria-hidden />}
      {state === "error" ? (
        <>
          <TypographicCover book={book} compact={size === "xs"} />
          {!decorative && <span className="sr-only">{alt}</span>}
        </>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          width={w}
          height={Math.round(w * 1.5)}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          onLoad={(e) => setState(e.currentTarget.naturalWidth < 20 ? "error" : "loaded")}
          onError={() => setState("error")}
          className={`absolute inset-0 size-full object-cover transition-[opacity,filter,transform] duration-700 ease-out ${
            state === "loaded" ? "scale-100 opacity-100 blur-0" : "scale-[1.03] opacity-0 blur-md"
          }`}
        />
      )}
      <div className="book-spine-shade pointer-events-none absolute inset-0" aria-hidden />
    </div>
  );
}
