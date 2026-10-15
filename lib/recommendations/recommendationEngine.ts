import "server-only";
import type { Book } from "@/types/book";
import { EMPTY_PREFERENCES, type Preferences } from "@/types/preferences";
import { getBook } from "@/lib/api/bookSearch";
import { mapSettled } from "@/lib/api/http";
import { enrichWithBudget, resolveReference, retrieveCandidates, withEnglishTitles } from "./candidates";
import { RETRIEVAL } from "./config";
import { recommendBooks } from "./engine";
import { buildSignals, parseFreeText, referenceFits } from "./preferenceMapper";
import { planRetrieval } from "./retrieval";
import { embedKeyed, getEmbedder, warmEmbedder } from "./semantic/embedder";
import type { RecommendationResult, SessionContext, Signals } from "./types";

/**
 * The server-side pipeline: resolves liked books and free-text references, plans and runs the
 * multi-route retrieval, then hands everything to the pure engine with the catalog enricher and
 * the local embedding model (when it is available) injected.
 *
 * Deterministic and local: no AI service is involved. The embedding model is a free, local
 * sentence-transformer; without it the engine scores with metadata only and still works.
 */

export interface RecommendOptions {
  qualityMode?: Signals["qualityMode"];
  /** Hand-tuned signal overrides used by Explore sections. */
  tweak?: (s: Signals) => Signals;
  /** How many top candidates get a description lookup. */
  enrichCount?: number;
  /** "Not for me" history for this session: rejected books are never shown again, reasons feed the ranking. */
  session?: SessionContext;
  /** "More like this": the book to center the recommendation profile on. */
  focus?: Book;
  /** Development-only: include every candidate's component scores and timings. */
  debug?: boolean;
  limit?: number;
  explorationShare?: number;
}

async function resolveLikedBooks(prefs: Preferences): Promise<Book[]> {
  const liked = prefs.likedBooks.slice(0, 5);
  const resolved = await mapSettled(liked, 3, (l) => getBook(l.id));
  return liked.map(
    (l, i) =>
      resolved[i] ?? {
        id: l.id,
        title: l.title,
        authors: l.authors,
        subjects: [],
        categories: [],
        source: "openlibrary" as const,
        sourceId: l.id,
      },
  );
}

/** "like Black Mirror", "similar to The Martian": look the reference up once, then treat it like a liked book. */
async function resolveReferences(prefs: Preferences): Promise<Book[]> {
  if (!prefs.freeText.trim()) return [];
  const refs = parseFreeText(prefs.freeText).references.slice(0, 2);
  if (!refs.length) return [];
  const likedTitles = new Set(prefs.likedBooks.map((b) => b.title.toLowerCase()));
  const resolved = await mapSettled(refs, 2, (r) => resolveReference(r));
  return resolved.filter((b): b is Book => !!b && !likedTitles.has(b.title.toLowerCase()) && referenceFits(b, prefs.freeText));
}

export async function recommend(prefs: Preferences, opts: RecommendOptions = {}): Promise<RecommendationResult> {
  warmEmbedder();
  const t0 = Date.now();
  const [likedBooks, references] = await Promise.all([resolveLikedBooks(prefs), resolveReferences(prefs)]);
  let signals = buildSignals(prefs, likedBooks, { references, focus: opts.focus, session: opts.session });
  if (opts.qualityMode) signals = { ...signals, qualityMode: opts.qualityMode };
  if (opts.tweak) signals = opts.tweak(signals);

  const plan = planRetrieval(signals);
  const tRetrieval = Date.now();
  const pool = await retrieveCandidates(plan);
  const retrievalMs = Date.now() - tRetrieval;

  const embedder = await getEmbedder(RETRIEVAL.embedWarmupWaitMs);
  const result = await recommendBooks(signals, pool.books, {
    embedder,
    embedKeyed,
    enrich: (books) => enrichWithBudget(books, RETRIEVAL.enrichBudgetMs),
    routes: pool.routes,
    queries: pool.queries,
    debug: opts.debug,
    enrichCount: opts.enrichCount,
    limit: opts.limit,
    explorationShare: opts.explorationShare,
  });
  await settleShownTitles(result);
  if (result.debug) {
    result.debug.timings.retrievalMs = retrievalMs;
    result.debug.timings.totalMs = Date.now() - t0;
  }
  if (process.env.NODE_ENV === "development") {
    console.info(`[libria] recommend: ${pool.books.length} candidates from ${plan.length} queries in ${retrievalMs}ms, total ${Date.now() - t0}ms, semantic=${result.semantic}`);
  }
  return result;
}

/**
 * Picks that were enriched already carry the title their English editions share; exploration and
 * reserve picks may come from outside that set, so the shown list gets one more (mostly cached) pass.
 * The narrative that names a pick is patched to match.
 */
async function settleShownTitles(result: RecommendationResult): Promise<void> {
  const shown = [...result.recommendations, ...result.reserve];
  const settled = await withEnglishTitles(
    shown.map((sb) => sb.book),
    RETRIEVAL.titleBudgetMs,
  );
  const renamed = new Map<string, string>();
  shown.forEach((sb, i) => {
    const book = settled[i];
    if (book === sb.book) return;
    if (book.title !== sb.book.title) renamed.set(sb.book.title, book.title);
    sb.book = book;
  });
  for (const [from, to] of renamed) {
    result.profileSummary = result.profileSummary.split(`(${from})`).join(`(${to})`);
    result.summary = result.summary.split(from).join(to);
  }
}

/**
 * "If you liked X" / "Find another like this".
 * With the reader's preferences: 60% similarity to the chosen book, 40% the original profile.
 * Without them: the engine centered on that book alone.
 */
export async function similarTo(bookId: string, prefs?: Preferences, opts: Pick<RecommendOptions, "debug" | "session"> = {}): Promise<RecommendationResult> {
  const focus = (await getBook(bookId).catch(() => undefined)) ?? { id: bookId, title: "", authors: [], subjects: [], categories: [], source: "openlibrary" as const, sourceId: bookId };
  const base = prefs ?? EMPTY_PREFERENCES;
  return recommend(base, { focus, enrichCount: 12, explorationShare: 0, ...opts });
}
