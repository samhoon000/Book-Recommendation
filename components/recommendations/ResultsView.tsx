"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Info, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeedbackReason } from "@/types/preferences";
import type { RecommendationResult, ScoredBook, SessionContext } from "@/lib/recommendations/types";
import { applyFeedback, selectRecommendations, type RejectedBook } from "@/lib/recommendations/select";
import { fetchRecommendations } from "@/lib/api/client";
import { FEEDBACK_REASONS } from "@/lib/discovery/options";
import { KEYS, readJson, writeJson } from "@/lib/storage/storage";
import { useRemote } from "@/hooks/useRemote";
import { useDiscovery } from "@/components/providers/DiscoveryProvider";
import { useBookModal } from "@/components/providers/BookModalProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Sheet } from "@/components/ui/Sheet";
import { EmptyState, QuietLibrary } from "@/components/ui/States";
import { BookCover } from "@/components/books/BookCover";
import { SaveButton } from "@/components/books/SaveButton";
import { GeneratingSequence } from "./GeneratingSequence";
import { FeaturedBook } from "./FeaturedBook";
import { RecommendationCard } from "./RecommendationCard";
import { MatchMeter } from "./MatchMeter";
import { WhyList } from "./WhyList";

interface StoredResult {
  key: string;
  result: RecommendationResult;
  rejected: Array<{ id: string; reason?: FeedbackReason }>;
}

const MIN_SEQUENCE_MS = 2200;
const SESSION_FEEDBACK_MAX_AGE_MS = 24 * 3600_000;

/** Books rejected recently in this browser: sent with every request so they are never recommended again. */
function recentSession(): SessionContext | undefined {
  const log = readJson<Array<{ bookId: string; reason?: FeedbackReason; at: number }>>(KEYS.feedback, [], "local", (v) => (Array.isArray(v) ? v.slice(-200) : []));
  const cutoff = Date.now() - SESSION_FEEDBACK_MAX_AGE_MS;
  const rejected = log
    .filter((f) => f.at >= cutoff || f.reason === "already-read")
    .slice(-60)
    .map((f) => ({ bookId: f.bookId, reason: f.reason }));
  return rejected.length ? { rejected } : undefined;
}

export function ResultsView() {
  const reduce = useReducedMotion();
  const { prefs, hydrated, hasAnswers } = useDiscovery();
  const { openBook } = useBookModal();
  const { notify } = useToast();
  const key = useMemo(() => JSON.stringify(prefs), [prefs]);

  // Reuse this session's results when returning from a book page or editing nothing.
  const [stored, setStored] = useState<StoredResult | undefined>();
  const [checkedStore, setCheckedStore] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    const s = readJson<StoredResult | undefined>(KEYS.results, undefined, "session");
    /* eslint-disable react-hooks/set-state-in-effect */
    setStored(s && s.key === key ? s : undefined);
    setCheckedStore(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [hydrated, key]);

  const remote = useRemote(checkedStore && !stored ? `rec:${key}` : null, (signal) => fetchRecommendations(prefs, signal, recentSession()));

  // Hold the generation moment for a beat so the reveal reads as cause and effect.
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setMinElapsed(true), reduce ? 0 : MIN_SEQUENCE_MS);
    return () => window.clearTimeout(t);
  }, [reduce]);

  const result = stored?.result ?? (remote.status === "success" ? remote.data : undefined);
  const [rejected, setRejected] = useState<Array<{ id: string; reason?: FeedbackReason }>>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setRejected(stored.rejected);
  }, [stored]);

  useEffect(() => {
    if (remote.status === "success") writeJson(KEYS.results, { key, result: remote.data, rejected: [] } satisfies StoredResult, "session");
  }, [remote.status, remote, key]);

  const pool = useMemo(() => (result ? [...result.recommendations, ...result.reserve] : []), [result]);

  const visible = useMemo(() => {
    if (!result) return [];
    const byId = new Map(pool.map((sb) => [sb.book.id, sb]));
    const rejectedBooks: RejectedBook[] = rejected.flatMap((r) => (byId.get(r.id) ? [{ scored: byId.get(r.id)!, reason: r.reason }] : []));
    const adjusted = applyFeedback(pool, rejectedBooks);
    // Same reranker as the server (diversity, author cap, roles), fed the similarity matrix it shipped.
    return selectRecommendations(adjusted, {
      likedIds: prefs.likedBooks.map((b) => b.id),
      likedTitles: prefs.likedBooks.map((b) => b.title),
      likedAuthors: prefs.likedBooks.flatMap((b) => b.authors.map((a) => a.toLowerCase())),
      similarity: result.similarity,
      explorationShare: result.hints?.explorationShare,
      targets: { complexity: result.hints?.complexityTarget, pace: result.hints?.paceTarget },
    }).recommendations;
  }, [result, pool, rejected, prefs.likedBooks]);

  const persistRejected = useCallback(
    (next: Array<{ id: string; reason?: FeedbackReason }>) => {
      setRejected(next);
      if (result) writeJson(KEYS.results, { key, result, rejected: next } satisfies StoredResult, "session");
      const log = readJson<Array<{ bookId: string; reason?: string; at: number }>>(KEYS.feedback, [], "local", (v) => (Array.isArray(v) ? v.slice(-200) : []));
      const last = next[next.length - 1];
      if (last) writeJson(KEYS.feedback, [...log.filter((f) => f.bookId !== last.id), { bookId: last.id, reason: last.reason, at: Date.now() }]);
    },
    [key, result],
  );

  const [whyFor, setWhyFor] = useState<ScoredBook | null>(null);
  const [askFor, setAskFor] = useState<ScoredBook | null>(null);

  const reject = useCallback(
    (sb: ScoredBook, reason?: FeedbackReason) => {
      persistRejected([...rejected.filter((r) => r.id !== sb.book.id), { id: sb.book.id, reason }]);
      notify(reason ? "Got it. We'll show you fewer books like this." : "Removed from this list.", {
        icon: "feedback",
        action: { label: "Undo", onClick: () => persistRejected(rejected.filter((r) => r.id !== sb.book.id)) },
      });
    },
    [notify, persistRejected, rejected],
  );

  const open = (sb: ScoredBook) => openBook(sb.book, { scored: sb, broad: result?.mode === "broad", onNotInterested: () => setAskFor(sb) });

  /* ------------------------------------------------------------ render states */

  if (hydrated && !hasAnswers && !result && remote.status !== "loading") {
    return (
      <div className="pt-32">
        <EmptyState
          title="Tell us a little first."
          body="Answer a question or two about what you're in the mood for, and we'll find books that fit. Or let us surprise you."
          action={{ href: "/discover", label: "Find my next book →" }}
        />
        <p className="text-center">
          <Link href="/surprise" className="text-parchment underline underline-offset-4 hover:text-vellum">
            Surprise me instead
          </Link>
        </p>
      </div>
    );
  }

  if (remote.status === "error") {
    return (
      <div className="pt-32">
        {remote.error.code === "unavailable" || remote.error.code === "network" ? (
          <QuietLibrary onRetry={remote.retry} message={remote.error.message} />
        ) : (
          <EmptyState title="Something went wrong on our side." body={remote.error.message} action={<button type="button" onClick={remote.retry} className="text-lamp underline">Try again</button>} />
        )}
      </div>
    );
  }

  const ready = !!result && (minElapsed || !!stored);
  if (!ready) {
    return (
      <div className="pt-20">
        <GeneratingSequence done={!!result} />
      </div>
    );
  }

  const broad = result.mode === "broad";
  const [featured, ...rest] = visible;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-32 pt-28 md:px-8 md:pt-36">
      <motion.header initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="mb-16 md:mb-24">
        <p className="font-display text-2xl italic text-lamp">We found some books for you.</p>
        <h1 className="display-xl mt-4 max-w-[14ch]">Your next chapter starts here.</h1>
        <p className="mt-6 max-w-[60ch] text-lg text-parchment">
          {broad ? "You skipped the questions, so these are widely loved books to start from." : result.profileSummary || "Based on your mood, interests, reading style, and the books you've loved."}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {result.chips.slice(0, 9).map((c, i) => (
            <span key={`${c.kind}-${c.label}-${i}`} className="rounded-full border border-rule px-3 py-1 text-sm text-parchment">
              {c.emoji ? `${c.emoji} ` : ""}
              {c.label}
            </span>
          ))}
          <Link href="/discover" className="ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-lamp underline-offset-4 hover:underline">
            <SlidersHorizontal className="size-3.5" aria-hidden /> Edit your preferences
          </Link>
        </div>
        {result.confidence === "low" && !broad && featured && (
          <p className="mt-8 flex max-w-[64ch] items-start gap-3 rounded-md border border-rule bg-umber/70 p-4 text-sm text-parchment">
            <Info className="mt-0.5 size-4 shrink-0 text-lamp" aria-hidden />
            We found a few interesting possibilities, but your preferences were broad. Add a favorite book or a few words about what you want for sharper picks.
          </p>
        )}
      </motion.header>

      {!featured ? (
        <EmptyState title="We couldn't find a strong match yet." body="Try broadening your preferences: fewer things to avoid, or a mood instead of a narrow genre." action={{ href: "/discover", label: "Edit your preferences" }} />
      ) : (
        <>
          <FeaturedBook sb={featured} summary={featured.book.id === result.recommendations[0]?.book.id ? result.summary : (featured.reasons[0]?.detail ?? "")} broad={broad} onOpen={() => open(featured)} onReject={() => setAskFor(featured)} />

          {rest.length > 0 && (
            <section className="mt-24 border-t border-rule pt-14 md:mt-32" aria-labelledby="more-title">
              <h2 id="more-title" className="display-md mb-12">
                {rest.length === 1 ? "One more worth a look" : `${rest.length} more that fit`}
              </h2>
              <motion.ul layout className="grid gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {rest.map((sb, i) => (
                    <motion.li
                      key={sb.book.id}
                      layout
                      initial={reduce ? false : { opacity: 0, y: 40 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, filter: "blur(6px)", transition: { duration: 0.3 } }}
                      transition={{ type: "spring", stiffness: 140, damping: 20, delay: Math.min(i, 6) * 0.06 }}
                      className="flex"
                    >
                      <RecommendationCard sb={sb} broad={broad} onOpen={() => open(sb)} onWhy={() => setWhyFor(sb)} onReject={() => setAskFor(sb)} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            </section>
          )}
          <p className="mt-24 text-center text-sm text-dim">
            Ranked from {result.poolSize} candidates found in Open Library{result.semantic ? ", compared by description as well as by subject" : ""}. Match percentages compare each book with your answers, not with other readers.
          </p>
        </>
      )}

      <WhySheet sb={whyFor} broad={broad} onClose={() => setWhyFor(null)} onOpen={(sb) => (setWhyFor(null), open(sb))} />
      <FeedbackSheet
        sb={askFor}
        onClose={() => setAskFor(null)}
        onSubmit={(sb, reason) => {
          setAskFor(null);
          reject(sb, reason);
        }}
      />
    </div>
  );
}

function WhySheet({ sb, broad, onClose, onOpen }: { sb: ScoredBook | null; broad: boolean; onClose: () => void; onOpen: (sb: ScoredBook) => void }) {
  const [last, setLast] = useState<ScoredBook | null>(sb);
  if (sb && sb !== last) setLast(sb);
  const shown = sb ?? last;
  return (
    <Sheet open={!!sb} onClose={onClose} labelledBy="why-title" variant="side">
      {shown && (
        <div className="px-6 pb-12 pt-16 md:px-10">
          <div className="flex items-start gap-5">
            <BookCover book={shown.book} size="sm" decorative />
            <div className="min-w-0">
              <p className="font-display text-2xl leading-tight text-vellum">{shown.book.title}</p>
              <p className="mt-1 text-sm text-parchment">{shown.book.authors[0]}</p>
              <div className="mt-4">
                <MatchMeter score={shown.score} broad={broad} compact />
              </div>
            </div>
          </div>
          <h2 id="why-title" className="display-md mt-10">
            Why we think you&rsquo;ll like it
          </h2>
          {shown.roleLabel && shown.role !== "strong" && shown.role !== "good" && <p className="mt-3 text-sm text-lamp">{shown.roleLabel}</p>}
          <div className="mt-8">
            <WhyList reasons={shown.reasons} />
          </div>
          {shown.explanation?.explorationReason && <p className="mt-6 text-[15px] leading-relaxed text-parchment">{shown.explanation.explorationReason}</p>}
          {(shown.tradeoffs?.length ?? 0) > 0 ? (
            <div className="mt-8 border-t border-rule pt-5 text-sm text-parchment">
              <p className="text-dim">{shown.tradeoffs!.length === 1 ? "One difference" : "A couple of differences"}</p>
              <ul className="mt-2 space-y-1.5">
                {shown.tradeoffs!.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : (
            shown.penalties.length > 0 && <p className="mt-8 border-t border-rule pt-5 text-sm text-dim">Held back a little because it {shown.penalties.slice(0, 2).join(" and ")}.</p>
          )}
          <div className="mt-10 flex flex-wrap gap-3">
            <SaveButton book={shown.book} variant="full" />
            <button type="button" onClick={() => onOpen(shown)} className="rounded-full border border-rule px-5 py-3 text-sm text-vellum hover:border-lamp/60 hover:text-lamp">
              Book details
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function FeedbackSheet({ sb, onClose, onSubmit }: { sb: ScoredBook | null; onClose: () => void; onSubmit: (sb: ScoredBook, reason?: FeedbackReason) => void }) {
  const [last, setLast] = useState<ScoredBook | null>(sb);
  if (sb && sb !== last) setLast(sb);
  const shown = sb ?? last;
  return (
    <Sheet open={!!sb} onClose={onClose} labelledBy="feedback-title" variant="compact">
      {shown && (
        <div className="px-6 pb-8 pt-12 md:px-8">
          <h2 id="feedback-title" className="font-display text-3xl">
            What didn&rsquo;t fit?
          </h2>
          <p className="mt-2 text-sm text-parchment">Optional. It helps us re-rank the rest of this list.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {FEEDBACK_REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onSubmit(shown, r.id)}
                className="rounded-full border border-rule px-4 py-2 text-[15px] text-vellum transition hover:border-lamp hover:bg-lamp hover:text-ink"
              >
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onSubmit(shown)} className="mt-6 text-sm text-parchment underline underline-offset-4 hover:text-vellum">
            Just remove it
          </button>
        </div>
      )}
    </Sheet>
  );
}
