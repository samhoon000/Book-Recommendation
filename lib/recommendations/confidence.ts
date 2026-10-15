import { CONFIDENCE } from "./config";
import type { Confidence, ScoredBook, Signals } from "./types";

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export interface ConfidenceReport {
  /** 0..1 */
  score: number;
  level: Confidence;
  /** The first pick is clearly ahead of the second. */
  clearWinner: boolean;
  /** Pieces behind the number, for the debug view. */
  parts: { completeness: number; candidateQuality: number; separation: number };
}

/**
 * confidence = profile completeness × candidate quality × score separation.
 * Weak candidates or a broad profile keep this low even when the ranking is technically correct,
 * and three books within a hundredth of each other never produce "definitely your best match".
 */
export function computeConfidence(picks: ScoredBook[], s: Signals, relaxed: boolean): ConfidenceReport {
  const scores = picks.map((p) => p.score);
  const top = scores[0] ?? 0;
  const top3 = scores.slice(0, 3);
  const meanTop = top3.length ? top3.reduce((a, b) => a + b, 0) / top3.length : 0;

  const completeness = clamp(0.3 + 0.7 * s.completeness);
  const candidateQuality = clamp((meanTop - 0.35) / 0.45) * (picks.length >= 3 ? 1 : 0.7) * (relaxed ? 0.75 : 1);
  const next = scores.slice(1, 5);
  const gap = next.length ? top - next.reduce((a, b) => a + b, 0) / next.length : 0;
  const separation = clamp(0.55 + gap * 3);

  const score = clamp(Math.sqrt(completeness) * Math.pow(candidateQuality, 0.7) * separation);
  const level: Confidence = score >= CONFIDENCE.high ? "high" : score >= CONFIDENCE.medium ? "medium" : "low";
  const clearWinner = scores.length >= 2 ? top - scores[1] >= CONFIDENCE.clearWinnerGap : scores.length === 1;
  return { score: Math.round(score * 1000) / 1000, level, clearWinner, parts: { completeness, candidateQuality, separation } };
}

/** Confidence for one pick: the global number scaled by how far it sits from the top. */
export function pickConfidence(sb: ScoredBook, top: number, global: number): number {
  const share = top ? sb.score / top : 0;
  return Math.round(clamp(global * (0.55 + 0.45 * share)) * 1000) / 1000;
}
