"use client";

import { motion, useReducedMotion } from "motion/react";
import { BookOpen, ThumbsDown } from "lucide-react";
import type { ScoredBook } from "@/lib/recommendations/types";
import { shortDescription } from "@/lib/api/validate";
import { BookCover } from "@/components/books/BookCover";
import { SaveButton } from "@/components/books/SaveButton";
import { MatchMeter } from "./MatchMeter";
import { genreTags } from "./RecommendationCard";

interface FeaturedProps {
  sb: ScoredBook;
  summary: string;
  broad: boolean;
  onOpen: () => void;
  onReject: () => void;
}

/** The top pick, given the stage: big cover, the reasons, and the narrative of why it won. */
export function FeaturedBook({ sb, summary, broad, onOpen, onReject }: FeaturedProps) {
  const reduce = useReducedMotion();
  const { book } = sb;
  const blurb = shortDescription(book.description, 320);
  const tags = genreTags(sb, 3);

  return (
    <article className="relative grid items-start gap-10 md:grid-cols-[minmax(240px,360px)_1fr] md:gap-16" aria-labelledby="featured-title">
      <div className="pointer-events-none absolute -left-40 -top-32 -z-10 size-[620px] rounded-full bg-[radial-gradient(circle,rgba(224,170,72,0.18),transparent_62%)]" aria-hidden />
      <motion.button
        type="button"
        onClick={onOpen}
        aria-label={`Open details for ${book.title}`}
        className="mx-auto block md:mx-0"
        initial={reduce ? false : { opacity: 0, scale: 0.86, rotate: -4, y: 40 }}
        animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
        transition={{ type: "spring", stiffness: 110, damping: 16, delay: 0.1 }}
        whileHover={reduce ? undefined : { y: -6, rotate: -0.6 }}
      >
        <BookCover book={book} size="fill" priority decorative className="w-[min(320px,68vw)] shadow-[0_50px_90px_-30px_rgba(0,0,0,1)] md:w-full" />
      </motion.button>

      <motion.div initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.25 }}>
        <p className="text-sm text-lamp">Your top match</p>
        <h2 id="featured-title" className="display-lg mt-3" style={{ textWrap: "balance" }}>
          <button type="button" onClick={onOpen} className="text-left transition-colors hover:text-lamp">
            {book.title}
          </button>
        </h2>
        <p className="mt-3 text-xl text-vellum/90">{book.authors.join(", ")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-parchment">
          {book.rating && book.rating.count >= 10 && (
            <span>
              <span className="text-lamp" aria-hidden>
                ★
              </span>{" "}
              {book.rating.average.toFixed(1)} from {book.rating.count.toLocaleString("en-US")} Open Library ratings
            </span>
          )}
          {book.publishedYear && <span>First published {book.publishedYear}</span>}
          {book.pageCount && <span>About {book.pageCount} pages</span>}
        </div>

        {blurb && <p className="prose-serif mt-6 max-w-[58ch] text-vellum/85">{blurb}</p>}

        <div className="mt-8">
          <MatchMeter score={sb.score} broad={broad} />
        </div>

        <section className="mt-8 border-t border-rule pt-7" aria-labelledby="featured-why">
          <h3 id="featured-why" className="font-display text-3xl">
            Why we picked this
          </h3>
          {sb.matched.length > 0 && (
            <>
              <p className="mt-4 text-sm text-parchment">You said you wanted:</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {sb.matched.slice(0, 6).map((m, i) => (
                  <motion.li
                    key={`${m.kind}-${m.label}-${i}`}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.06 }}
                    className="rounded-full border border-lamp/35 bg-lamp/[0.08] px-3.5 py-1.5 text-sm text-vellum"
                  >
                    {m.emoji ? `${m.emoji} ` : ""}
                    {m.label}
                  </motion.li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-vellum/85">{summary}</p>
          {sb.tradeoffs && sb.tradeoffs.length > 0 && (
            <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-parchment">
              <span className="text-dim">One difference: </span>
              {sb.tradeoffs[0]}
            </p>
          )}
          {tags.length > 0 && <p className="mt-3 text-sm capitalize text-dim">{tags.join(", ")}</p>}
        </section>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <SaveButton book={book} variant="full" />
          <button type="button" onClick={onOpen} className="inline-flex items-center gap-2 rounded-full border border-rule px-5 py-3 text-sm text-vellum transition hover:border-lamp/60 hover:text-lamp">
            <BookOpen className="size-4" aria-hidden />
            Details and reasons
          </button>
          <button type="button" onClick={onReject} className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm text-dim transition hover:text-vellum">
            <ThumbsDown className="size-4" aria-hidden />
            Not for me
          </button>
        </div>
      </motion.div>
    </article>
  );
}
