"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookOpen, Shuffle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SurpriseKind, SurpriseResult } from "@/lib/recommendations/surprise";
import { ApiError, fetchSurprise } from "@/lib/api/client";
import { shortDescription } from "@/lib/api/validate";
import { BookCover } from "@/components/books/BookCover";
import { SaveButton } from "@/components/books/SaveButton";
import { useBookModal } from "@/components/providers/BookModalProvider";
import { QuietLibrary } from "@/components/ui/States";

type Phase = { name: "choose" } | { name: "shuffling"; kind: SurpriseKind } | { name: "reveal"; kind: SurpriseKind; result: SurpriseResult } | { name: "error"; kind: SurpriseKind; message: string };

const KINDS: Array<{ id: SurpriseKind; title: string; note: string }> = [
  { id: "fiction", title: "Fiction", note: "A story from somewhere unexpected" },
  { id: "nonfiction", title: "Non-fiction", note: "A true thing you didn't know you wanted" },
  { id: "any", title: "Anything", note: "Let the shelves decide" },
];

const CLOTHS = ["#6b2f2a", "#2f4a3c", "#2c3a5c", "#5a4a2a", "#4a2f45", "#7a5a30", "#2b4b4f"];
const SHUFFLE_MS = 2400;

export function SurpriseView() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>({ name: "choose" });
  const { openBook } = useBookModal();
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const draw = async (kind: SurpriseKind) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setPhase({ name: "shuffling", kind });
    const minimum = new Promise((r) => setTimeout(r, reduce ? 0 : SHUFFLE_MS));
    try {
      const [result] = await Promise.all([fetchSurprise(kind, c.signal), minimum]);
      if (!c.signal.aborted) setPhase({ name: "reveal", kind, result });
    } catch (err) {
      if (c.signal.aborted) return;
      setPhase({ name: "error", kind, message: err instanceof ApiError ? err.message : "The shelves came up empty." });
    }
  };

  return (
    <div className="relative isolate mx-auto min-h-dvh max-w-[1300px] overflow-hidden px-4 pb-32 pt-28 md:px-8 md:pt-36">
      <div className="pointer-events-none absolute left-1/2 top-1/3 -z-10 size-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(224,170,72,0.13),transparent_62%)]" aria-hidden />
      <AnimatePresence mode="wait">
        {phase.name === "choose" && (
          <motion.section key="choose" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} aria-labelledby="surprise-title">
            <h1 id="surprise-title" className="display-xl max-w-[12ch]">
              Pull a book off the shelf.
            </h1>
            <p className="mt-5 max-w-[46ch] text-lg text-parchment">No questions. One choice, then a well-rated wildcard from a corner of the catalog you might never wander into.</p>
            <ul className="mt-12 grid gap-4 md:grid-cols-3">
              {KINDS.map((k, i) => (
                <li key={k.id}>
                  <motion.button
                    type="button"
                    onClick={() => draw(k.id)}
                    whileHover={reduce ? undefined : { y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    className="group relative flex h-full w-full items-end gap-5 overflow-hidden rounded-md border border-rule bg-umber/70 p-6 text-left transition-colors hover:border-lamp/50"
                  >
                    <span className="flex items-end gap-1" aria-hidden>
                      {[0, 1, 2].map((j) => (
                        <span
                          key={j}
                          className="book-shape block w-3.5 transition-transform duration-500 group-hover:-translate-y-1"
                          style={{ height: 52 + ((i * 3 + j * 7) % 20), background: CLOTHS[(i * 2 + j) % CLOTHS.length], transitionDelay: `${j * 60}ms` }}
                        />
                      ))}
                    </span>
                    <span>
                      <span className="block font-display text-3xl text-vellum">{k.title}</span>
                      <span className="mt-1 block text-sm text-parchment">{k.note}</span>
                    </span>
                  </motion.button>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {phase.name === "shuffling" && (
          <motion.section key="shuffling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[60dvh] flex-col items-center justify-center" role="status" aria-live="polite">
            <div className="relative h-[270px] w-[180px]" aria-hidden>
              {CLOTHS.map((c, i) => (
                <motion.div
                  key={i}
                  className="book-shape absolute inset-0 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.9)]"
                  style={{ background: `linear-gradient(135deg, ${c}, #15120f)`, zIndex: i }}
                  initial={{ rotate: (i - 3) * 2, x: 0, y: -i * 2 }}
                  animate={
                    reduce
                      ? undefined
                      : {
                          x: [0, (i % 2 ? 1 : -1) * (90 + i * 6), 0],
                          rotate: [(i - 3) * 2, (i % 2 ? 1 : -1) * 14, (i - 3) * 2],
                          zIndex: [i, CLOTHS.length - i, i],
                        }
                  }
                  transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.15, delay: i * 0.09, ease: "easeInOut" }}
                >
                  <div className="absolute inset-x-[14%] top-[18%] h-px bg-lamp/50" />
                  <div className="absolute inset-x-[14%] top-[22%] h-px bg-lamp/50" />
                </motion.div>
              ))}
            </div>
            <p className="mt-14 font-display text-3xl text-vellum">Shuffling the stacks…</p>
          </motion.section>
        )}

        {phase.name === "reveal" && (
          <motion.section key={`reveal-${phase.result.book.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-labelledby="wildcard-title">
            <div className="grid items-center gap-10 md:grid-cols-[minmax(240px,380px)_1fr] md:gap-16">
              <div className="relative mx-auto h-[min(570px,102vw)] w-[min(380px,68vw)] md:mx-0 md:w-full">
                {/* the decoys fan away, the pick slides forward and grows */}
                {phase.result.decoys.slice(0, 5).map((d, i) => (
                  <motion.div
                    key={d.id}
                    className="absolute left-[18%] top-[12%] w-[64%]"
                    initial={{ x: 0, rotate: 0, opacity: 1 }}
                    animate={{ x: (i - 2) * 46, y: 30 + Math.abs(i - 2) * 10, rotate: (i - 2) * 7, opacity: 0.35, scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 90, damping: 16, delay: 0.05 * i }}
                    aria-hidden
                  >
                    <BookCover book={d} size="fill" decorative />
                  </motion.div>
                ))}
                <motion.button
                  type="button"
                  onClick={() => openBook(phase.result.book)}
                  className="absolute inset-x-0 top-0 z-10 block"
                  initial={reduce ? false : { y: 70, scale: 0.6, rotate: -8 }}
                  animate={{ y: 0, scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.35 }}
                  aria-label={`Open details for ${phase.result.book.title}`}
                >
                  <BookCover book={phase.result.book} size="fill" priority decorative className="shadow-[0_50px_90px_-30px_rgba(0,0,0,1)]" />
                </motion.button>
              </div>

              <motion.div initial={reduce ? false : { opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7, type: "spring", stiffness: 120, damping: 20 }}>
                <p className="font-display text-2xl italic text-lamp">Your wildcard:</p>
                <h1 id="wildcard-title" className="display-lg mt-3" style={{ textWrap: "balance" }}>
                  {phase.result.book.title}
                </h1>
                <p className="mt-3 text-xl text-vellum/90">{phase.result.book.authors.join(", ")}</p>
                <p className="mt-2 text-sm text-parchment">
                  Pulled from the <span className="text-vellum">{phase.result.subject}</span> shelf
                  {phase.result.book.rating ? `, rated ${phase.result.book.rating.average.toFixed(1)} by ${phase.result.book.rating.count} readers` : ""}
                  {phase.result.book.publishedYear ? `, first published ${phase.result.book.publishedYear}` : ""}.
                </p>
                {phase.result.book.description && <p className="prose-serif mt-6 max-w-[56ch] text-vellum/85">{shortDescription(phase.result.book.description, 360)}</p>}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <SaveButton book={phase.result.book} variant="full" />
                  <button type="button" onClick={() => openBook(phase.result.book)} className="inline-flex items-center gap-2 rounded-full border border-rule px-5 py-3 text-sm text-vellum hover:border-lamp/60 hover:text-lamp">
                    <BookOpen className="size-4" aria-hidden /> Details
                  </button>
                  <button type="button" onClick={() => draw(phase.kind)} className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm text-parchment hover:text-vellum">
                    <Shuffle className="size-4" aria-hidden /> Shuffle again
                  </button>
                </div>
                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <Link href={`/explore?like=${encodeURIComponent(phase.result.book.id)}&title=${encodeURIComponent(phase.result.book.title)}#if-you-liked`} className="inline-flex items-center gap-1.5 text-lamp underline-offset-4 hover:underline">
                    <Sparkles className="size-4" aria-hidden /> Find more like this
                  </Link>
                  <button type="button" onClick={() => setPhase({ name: "choose" })} className="text-parchment underline-offset-4 hover:text-vellum hover:underline">
                    Change fiction or non-fiction
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.section>
        )}

        {phase.name === "error" && (
          <motion.section key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <QuietLibrary onRetry={() => draw(phase.kind)} message={phase.message} />
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
