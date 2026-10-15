"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Shuffle } from "lucide-react";
import { LibraryCanvas } from "./LibraryCanvas";

const HEADLINE = ["Find", "your", "next", "unforgettable", "book."];

export function Hero() {
  const reduce = useReducedMotion();
  return (
    <section className="relative isolate flex min-h-[100dvh] items-end overflow-hidden pb-[calc(6rem+env(safe-area-inset-bottom))] pt-28 md:items-center md:pb-24">
      <LibraryCanvas className="absolute inset-0 -z-20 size-full" />
      {/* Readability: darken behind the text column and fade into the page */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(18,16,13,0.92)_0%,rgba(18,16,13,0.7)_38%,rgba(18,16,13,0.05)_75%)] max-md:bg-[linear-gradient(0deg,rgba(18,16,13,0.97)_20%,rgba(18,16,13,0.55)_60%,rgba(18,16,13,0.25)_100%)]" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-ink to-transparent" aria-hidden />

      <div className="mx-auto w-full max-w-[1400px] px-4 md:px-8">
        <h1 className="display-xl max-w-[14ch]" aria-label="Find your next unforgettable book.">
          {HEADLINE.map((word, i) => (
            <motion.span
              key={word}
              aria-hidden
              className={`inline-block pr-[0.22em]`}
              initial={reduce ? false : { opacity: 0, y: "0.45em", filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.15 + i * 0.09, type: "spring", stiffness: 120, damping: 20 }}
            >
              {word}
            </motion.span>
          ))}
        </h1>

        <motion.p
          className="mt-7 max-w-[36ch] text-lg leading-relaxed text-vellum/80 md:text-xl"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          Tell us what you want to feel, explore, or become. We&rsquo;ll find the books that fit.
        </motion.p>

        <motion.div
          className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <Link
            href="/discover"
            className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-lamp px-7 py-4 text-base font-medium text-ink shadow-[0_0_0_1px_rgba(224,170,72,0.4),0_18px_50px_-12px_rgba(224,170,72,0.55)] transition active:scale-[0.98]"
          >
            <span className="absolute inset-0 -translate-x-full bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.45),transparent)] transition-transform duration-700 group-hover:translate-x-full" aria-hidden />
            Find my next book
            <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>
              →
            </span>
          </Link>
          <Link href="/surprise" className="group inline-flex items-center gap-2.5 text-base text-vellum underline decoration-rule decoration-1 underline-offset-[6px] transition hover:decoration-lamp">
            <Shuffle className="size-4 text-lamp transition-transform duration-500 group-hover:rotate-180" aria-hidden />
            Surprise me
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
