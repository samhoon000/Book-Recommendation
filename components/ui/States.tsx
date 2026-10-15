import Link from "next/link";
import type { ReactNode } from "react";

/** Composed empty and error states. They say what happened and offer the next step. */

export function QuietLibrary({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <ShelfGlyph />
      <p className="display-md">The library is being a little quiet right now.</p>
      <p className="text-parchment">{message && !/quiet/.test(message) ? message : "Open Library didn't answer in time. Try again in a moment."}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-full border border-lamp/60 px-5 py-2.5 text-sm text-lamp transition hover:bg-lamp hover:text-ink">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } | ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <ShelfGlyph />
      <p className="display-md">{title}</p>
      <p className="text-parchment">{body}</p>
      {action && typeof action === "object" && "href" in action ? (
        <Link href={action.href} className="mt-2 inline-flex items-center gap-2 rounded-full bg-lamp px-6 py-3 text-sm font-medium text-ink transition hover:bg-[#ebb95a] active:scale-[0.98]">
          {action.label}
        </Link>
      ) : (
        action
      )}
    </div>
  );
}

/** A few leaning spines, drawn once. */
export function ShelfGlyph() {
  return (
    <svg width="88" height="56" viewBox="0 0 88 56" aria-hidden className="text-rule">
      <rect x="10" y="12" width="10" height="40" rx="1" fill="currentColor" />
      <rect x="22" y="6" width="12" height="46" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="36" y="16" width="9" height="36" rx="1" fill="var(--lamp)" opacity="0.65" />
      <rect x="52" y="10" width="11" height="44" rx="1" fill="currentColor" transform="rotate(14 57 52)" opacity="0.8" />
      <line x1="2" y1="53" x2="86" y2="53" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function CoverSkeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer book-shape aspect-[2/3] ${className}`} aria-hidden />;
}

export function LineSkeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer h-3 rounded ${className}`} aria-hidden />;
}
