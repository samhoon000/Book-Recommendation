"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ExternalLink, Sparkles, ThumbsDown } from "lucide-react";
import type { Book } from "@/types/book";
import type { ScoredBook } from "@/lib/recommendations/types";
import { fetchBook, fetchSimilar } from "@/lib/api/client";
import { normalizeSubjects } from "@/lib/recommendations/taxonomy";
import { useRemote } from "@/hooks/useRemote";
import { BookCover } from "./BookCover";
import { SaveButton } from "./SaveButton";
import { MatchMeter } from "@/components/recommendations/MatchMeter";
import { WhyList } from "@/components/recommendations/WhyList";
import { CoverSkeleton, EmptyState, LineSkeleton, QuietLibrary } from "@/components/ui/States";

export interface BookDetailProps {
  /** Whatever we already know (from a card or search result); details are fetched to fill the rest. */
  initial: Pick<Book, "id" | "title" | "authors"> & Partial<Book>;
  scored?: ScoredBook;
  broad?: boolean;
  onNotInterested?: () => void;
  onOpenBook?: (book: Pick<Book, "id" | "title" | "authors" | "coverUrl">) => void;
  titleId: string;
  /** Render as a full page instead of inside a sheet. */
  page?: boolean;
}

export function BookDetail({ initial, scored, broad, onNotInterested, onOpenBook, titleId, page }: BookDetailProps) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const full = useRemote(`book:${initial.id}`, (signal) => fetchBook(initial.id, signal));
  const similar = useRemote(`similar:${initial.id}`, (signal) => fetchSimilar(initial.id, signal));

  const book: Partial<Book> & Pick<Book, "id" | "title" | "authors"> = full.status === "success" ? { ...initial, ...full.data, coverUrl: initial.coverUrl ?? full.data.coverUrl, coverUrlLarge: initial.coverUrlLarge ?? full.data.coverUrlLarge } : initial;
  const subjects = normalizeSubjects([...(book.subjects ?? []), ...(book.categories ?? [])], 14).slice(0, 12);
  const loadingDetails = full.status === "loading" || full.status === "idle";

  const meta: Array<[string, string | number | undefined]> = [
    ["First published", book.publishedYear],
    ["Publisher", book.publisher],
    ["Length", book.pageCount ? `About ${book.pageCount} pages` : undefined],
    ["ISBN", book.isbn],
  ];

  if (!initial.title && full.status === "error") {
    return full.error.code === "not_found" || full.error.code === "bad_request" ? (
      <EmptyState title="We couldn't find that book." body="The link may be out of date, or the catalog no longer lists it." action={{ href: "/explore", label: "Explore books" }} />
    ) : (
      <QuietLibrary onRetry={full.retry} message={full.error.message} />
    );
  }

  return (
    <article className={`relative ${page ? "" : "pb-10"}`}>
      {/* Lamp glow behind the cover */}
      <div className="pointer-events-none absolute -left-24 -top-24 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(224,170,72,0.16),transparent_65%)]" aria-hidden />

      <div className="relative grid gap-8 px-5 pt-16 md:grid-cols-[minmax(220px,300px)_1fr] md:gap-12 md:px-12 md:pt-12">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 22 }}
          className="mx-auto md:sticky md:top-8 md:mx-0 md:self-start"
        >
          {book.title ? <BookCover book={book} size="xl" priority className="md:w-full" /> : <CoverSkeleton className="w-[min(300px,62vw)] md:w-[300px]" />}
          {scored && (
            <div className="mt-6 hidden md:block">
              <MatchMeter score={scored.score} broad={broad} />
            </div>
          )}
        </motion.div>

        <div className="min-w-0">
          {book.title ? (
            <h2 id={titleId} className="display-lg" style={{ textWrap: "balance" }}>
              {book.title}
            </h2>
          ) : (
            <h2 id={titleId} className="space-y-3" aria-label="Loading book">
              <LineSkeleton className="h-10 w-3/4" />
              <LineSkeleton className="h-10 w-1/2" />
            </h2>
          )}
          {book.subtitle && <p className="mt-2 font-display text-2xl italic text-parchment">{book.subtitle}</p>}
          <p className="mt-4 text-lg text-vellum/90">{book.authors.join(", ") || "Unknown author"}</p>

          {book.rating && book.rating.count >= 5 && (
            <p className="mt-2 flex items-center gap-2 text-sm text-parchment">
              <Stars value={book.rating.average} />
              <span className="tabular-nums">
                {book.rating.average.toFixed(1)} from {book.rating.count.toLocaleString("en-US")} ratings
              </span>
              <span className="text-dim">on {book.source === "googlebooks" ? "Google Books" : "Open Library"}</span>
            </p>
          )}

          {scored && (
            <div className="mt-5 md:hidden">
              <MatchMeter score={scored.score} broad={broad} />
            </div>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <SaveButton book={book as Book} variant="full" />
            <button
              type="button"
              onClick={() => router.push(`/explore?like=${encodeURIComponent(book.id)}&title=${encodeURIComponent(book.title)}#if-you-liked`)}
              className="inline-flex items-center gap-2 rounded-full border border-rule px-5 py-3 text-sm text-vellum transition hover:border-lamp/60 hover:text-lamp active:scale-[0.98]"
            >
              <Sparkles className="size-4" aria-hidden />
              Find another like this
            </button>
            {onNotInterested && (
              <button
                type="button"
                onClick={onNotInterested}
                className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm text-parchment transition hover:text-vellum"
              >
                <ThumbsDown className="size-4" aria-hidden />
                Not interested
              </button>
            )}
          </div>

          <section className="mt-10" aria-label="Description">
            {loadingDetails && !book.description ? (
              <div className="space-y-3">
                <LineSkeleton className="w-full" />
                <LineSkeleton className="w-11/12" />
                <LineSkeleton className="w-4/5" />
              </div>
            ) : book.description ? (
              <div className="prose-serif max-w-[62ch] whitespace-pre-line text-vellum/90">{book.description}</div>
            ) : (
              <p className="max-w-[60ch] text-parchment">
                {book.firstSentence ? (
                  <>
                    It opens: <span className="font-display text-xl italic text-vellum">“{book.firstSentence}”</span>
                  </>
                ) : (
                  "The catalog doesn't include a description for this book yet."
                )}
              </p>
            )}
          </section>

          {scored && (
            <section className="mt-12 border-t border-rule pt-8" aria-labelledby={`${titleId}-why`}>
              <h3 id={`${titleId}-why`} className="display-md">
                Why we think you&rsquo;ll like it
              </h3>
              {scored.matched.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Your preferences this book matches">
                  {scored.matched.map((m, i) => (
                    <li key={`${m.kind}-${m.label}-${i}`} className="rounded-full border border-lamp/30 bg-lamp/[0.07] px-3 py-1 text-sm text-vellum">
                      {m.emoji ? `${m.emoji} ` : ""}
                      {m.label}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-6">
                <WhyList reasons={scored.reasons} />
              </div>
              {scored.tradeoffs && scored.tradeoffs.length > 0 && (
                <p className="mt-6 text-sm text-parchment">
                  <span className="text-dim">{scored.tradeoffs.length === 1 ? "One difference: " : "Differences: "}</span>
                  {scored.tradeoffs.join(" ")}
                </p>
              )}
            </section>
          )}

          <section className="mt-12 border-t border-rule pt-8" aria-label="Details">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {meta.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-dim">{label}</dt>
                  <dd className="mt-1 text-sm text-vellum">{value ?? (loadingDetails ? "…" : "Not listed")}</dd>
                </div>
              ))}
            </dl>
            {subjects.length > 0 && (
              <ul className="mt-7 flex flex-wrap gap-2" aria-label="Subjects">
                {subjects.map((s) => (
                  <li key={s} className="rounded-full bg-shelf px-3 py-1 text-xs capitalize text-parchment">
                    {s}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm">
              {book.sourceUrl && (
                <a href={book.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-lamp underline-offset-4 hover:underline">
                  View book details on {book.source === "googlebooks" ? "Google Books" : "Open Library"}
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
              {!page && (
                <Link href={`/book/${book.id}`} className="text-parchment underline-offset-4 hover:text-vellum hover:underline">
                  Open as a page
                </Link>
              )}
            </div>
            <p className="mt-4 text-xs text-dim">
              Book data and covers from {book.source === "googlebooks" ? "Google Books" : "Open Library"}.
            </p>
          </section>

          <section className="mt-12 border-t border-rule pt-8" aria-labelledby={`${titleId}-similar`}>
            <h3 id={`${titleId}-similar`} className="display-md">
              Similar books
            </h3>
            <div className="shelf-scroll -mx-5 mt-6 flex gap-5 overflow-x-auto px-5 pb-4 md:mx-0 md:px-0">
              {similar.status === "success" ? (
                similar.data.length ? (
                  similar.data.map((sb) => (
                    <button
                      key={sb.book.id}
                      type="button"
                      onClick={() => onOpenBook?.(sb.book)}
                      className="group w-[120px] shrink-0 text-left"
                    >
                      <div className="transition duration-300 group-hover:-translate-y-1">
                        <BookCover book={sb.book} size="fill" decorative />
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-snug text-vellum">{sb.book.title}</p>
                      <p className="line-clamp-1 text-xs text-parchment">{sb.book.authors[0]}</p>
                    </button>
                  ))
                ) : (
                  <p className="text-parchment">No close neighbours in the catalog for this one.</p>
                )
              ) : similar.status === "error" ? (
                <p className="text-parchment">Similar books couldn&rsquo;t load right now.</p>
              ) : (
                Array.from({ length: 5 }, (_, i) => <CoverSkeleton key={i} className="w-[120px] shrink-0" />)
              )}
            </div>
          </section>
        </div>
      </div>
    </article>
  );
}

function Stars({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="relative inline-block text-sm leading-none tracking-[0.15em]" aria-hidden>
      <span className="text-rule">★★★★★</span>
      <span className="absolute inset-0 overflow-hidden text-lamp" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  );
}
