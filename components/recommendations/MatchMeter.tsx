import { matchLabel } from "@/lib/recommendations/select";

/**
 * Shows the engine's real score. Worded as a preference match, never as a probability.
 * In "broad" sessions (no preferences given) the percentage would be meaningless, so it's hidden.
 */
export function MatchMeter({ score, broad, compact }: { score: number; broad?: boolean; compact?: boolean }) {
  const pct = Math.round(score * 100);
  if (broad) {
    return <span className="text-xs text-parchment">Widely loved</span>;
  }
  return (
    <div className={`flex items-center gap-2.5 ${compact ? "text-xs" : "text-sm"}`} title="How closely this book matches the preferences you gave, based on catalog metadata.">
      <svg viewBox="0 0 36 36" className={compact ? "size-7" : "size-9"} aria-hidden>
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--rule)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke="var(--lamp)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 97.4} 97.4`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="leading-tight">
        <span className="font-medium tabular-nums text-vellum">{pct}%</span> <span className="text-parchment">preference match</span>
        {!compact && <span className="block text-xs text-dim">{matchLabel(score)}</span>}
      </span>
    </div>
  );
}
