"use client";

import { motion, useReducedMotion } from "motion/react";
import type { MatchReason } from "@/lib/recommendations/types";

/** Concrete, evidence-based reasons. Each item pairs what the reader asked for with what the catalog shows. */
export function WhyList({ reasons, animate = true }: { reasons: MatchReason[]; animate?: boolean }) {
  const reduce = useReducedMotion();
  if (!reasons.length) {
    return <p className="text-parchment">This book scored well overall, but the catalog has little detail about it, so treat it as a looser match.</p>;
  }
  return (
    <ol className="space-y-5">
      {reasons.map((r, i) => (
        <motion.li
          key={`${r.kind}-${i}`}
          initial={animate && !reduce ? { opacity: 0, x: -10 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.08 + i * 0.07, type: "spring", stiffness: 260, damping: 26 }}
          className="relative pl-6"
        >
          <span className="absolute left-0 top-[0.55em] size-2 rounded-full bg-lamp shadow-[0_0_12px_var(--lamp)]" aria-hidden />
          <p className="font-display text-xl leading-snug text-vellum">{r.heading}</p>
          <p className="mt-1 max-w-[60ch] text-[15px] leading-relaxed text-parchment">{r.detail}</p>
        </motion.li>
      ))}
    </ol>
  );
}
