"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { HelpCircle, ThumbsDown } from "lucide-react";
import type { PointerEvent } from "react";
import type { ScoredBook } from "@/lib/recommendations/types";
import { TAGS, type TagId } from "@/lib/recommendations/taxonomy";
import { shortDescription } from "@/lib/api/validate";
import { BookCover } from "@/components/books/BookCover";
import { SaveButton } from "@/components/books/SaveButton";
import { MatchMeter } from "./MatchMeter";

export function genreTags(sb: ScoredBook, n = 2): string[] {
  return (Object.entries(sb.profile.tags) as Array<[TagId, number]>)
    .filter(([id, v]) => TAGS[id].kind === "genre" && v >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => TAGS[id].label);
}

interface CardProps {
  sb: ScoredBook;
  broad: boolean;
  onOpen: () => void;
  onWhy: () => void;
  onReject: () => void;
}

/**
 * A recommendation as an object on the table: the cover leads, tilts gently toward the pointer,
 * and the card's glow warms on hover. Touch devices skip the tilt.
 */
export function RecommendationCard({ sb, broad, onOpen, onWhy, onReject }: CardProps) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [5, -5]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [0, 1], [-7, 7]), { stiffness: 200, damping: 20 });
  const glowX = useTransform(mx, (v) => `${v * 100}%`);
  const glowY = useTransform(my, (v) => `${v * 100}%`);
  const glow = useTransform([glowX, glowY], ([x, y]) => `radial-gradient(260px circle at ${x} ${y}, rgba(224,170,72,0.10), transparent 70%)`);

  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  const onLeave = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  const tags = genreTags(sb);
  const blurb = shortDescription(sb.book.description, 170);

  return (
    <motion.article
      layout
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className="group relative flex flex-col"
      aria-labelledby={`card-${sb.book.id}`}
    >
      <motion.div
        className="pointer-events-none absolute -inset-4 -z-10 rounded-xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: glow }}
        aria-hidden
      />
      <button type="button" onClick={onOpen} className="relative block self-start text-left [perspective:900px]" aria-label={`Open details for ${sb.book.title}`}>
        <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }} className="transition-shadow duration-500 group-hover:shadow-[0_40px_60px_-30px_rgba(0,0,0,1)]">
          <BookCover book={sb.book} size="fill" decorative className="w-[150px] sm:w-[170px]" />
        </motion.div>
      </button>

      <div className="mt-5 flex items-start justify-between gap-3">
        <MatchMeter score={sb.score} broad={broad} compact />
        <SaveButton book={sb.book} />
      </div>
      {sb.roleLabel && sb.role !== "strong" && sb.role !== "good" && sb.role !== "perfect" && (
        <p className="mt-2 font-display text-base italic text-lamp">{sb.roleLabel}</p>
      )}

      <h3 id={`card-${sb.book.id}`} className="mt-3 font-display text-[1.65rem] leading-[1.08] text-vellum">
        <button type="button" onClick={onOpen} className="text-left hover:text-lamp">
          {sb.book.title}
        </button>
      </h3>
      <p className="mt-1 text-[15px] text-parchment">
        {sb.book.authors.slice(0, 2).join(", ")}
        {sb.book.publishedYear ? <span className="text-dim">, {sb.book.publishedYear}</span> : null}
      </p>

      {(tags.length > 0 || sb.book.pageCount) && (
        <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {tags.map((t) => (
            <li key={t} className="rounded-full bg-shelf px-2.5 py-1 capitalize text-parchment">
              {t}
            </li>
          ))}
          {sb.book.pageCount && <li className="rounded-full border border-rule px-2.5 py-1 text-dim">~{sb.book.pageCount} pages</li>}
        </ul>
      )}

      {blurb && <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-vellum/75">{blurb}</p>}

      <div className="mt-auto flex items-center gap-1 pt-4">
        <button type="button" onClick={onWhy} className="inline-flex items-center gap-1.5 rounded-full border border-rule px-3.5 py-2 text-sm text-vellum transition hover:border-lamp/60 hover:text-lamp">
          <HelpCircle className="size-4" aria-hidden />
          Why this?
        </button>
        <button type="button" onClick={onReject} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-dim transition hover:text-vellum">
          <ThumbsDown className="size-4" aria-hidden />
          Not for me
        </button>
      </div>
    </motion.article>
  );
}
