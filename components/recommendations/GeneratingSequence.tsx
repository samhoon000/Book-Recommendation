"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

const LINES = ["Reading your mood", "Searching the catalog", "Weighing every candidate", "Choosing the few that fit"];

/**
 * Shown while the engine works. Each line names a step the pipeline really performs.
 * Spines slide out of a shelf one by one, as if being pulled for you.
 */
export function GeneratingSequence({ done }: { done: boolean }) {
  const reduce = useReducedMotion();
  const [line, setLine] = useState(0);

  useEffect(() => {
    if (done) return;
    const t = window.setInterval(() => setLine((l) => Math.min(LINES.length - 1, l + 1)), 1500);
    return () => window.clearInterval(t);
  }, [done]);

  const spines = [62, 80, 70, 92, 66, 84, 74, 58, 88, 68, 78];

  return (
    <div className="flex min-h-[78dvh] flex-col items-center justify-center px-4 text-center" role="status" aria-live="polite">
      <div className="flex h-28 items-end gap-1.5" aria-hidden>
        {spines.map((h, i) => (
          <motion.span
            key={i}
            className="book-shape w-4 bg-shelf"
            style={{ height: `${h}%` }}
            animate={
              reduce
                ? undefined
                : {
                    y: [0, -18, 0],
                    backgroundColor: ["#24201a", "#e0aa48", "#24201a"],
                  }
            }
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.14, ease: "easeInOut" }}
          />
        ))}
      </div>
      <div className="mt-2 h-1.5 w-64 bg-[linear-gradient(180deg,#3a2c1f,#231a12)]" aria-hidden />
      <div className="mt-12 h-10">
        <AnimatePresence mode="wait">
          <motion.p
            key={line}
            className="font-display text-3xl text-vellum md:text-4xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
          >
            {LINES[line]}
            <span className="text-lamp">…</span>
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
