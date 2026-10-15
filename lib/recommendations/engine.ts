import type { Book } from "@/types/book";
import { computeConfidence, pickConfidence } from "./confidence";
import { ENGINE_VERSION, PRIORITY_MULTIPLIER, RETRIEVAL, SCORE_WEIGHTS } from "./config";
import { buildExplanation, featuredNarrative, profileNarrative } from "./explain";
import { applyHardFilters } from "./filters";
import { priorityOf, signalChips } from "./preferenceMapper";
import { bookSimilarity, buildProfile } from "./profile";
import { popularityPercentiles } from "./quality";
import { rerank, similarityMatrix, type RerankContext } from "./rerank";
import { scoreBook, type ScoreContext } from "./scoring";
import { bookDocument, bookEmbeddingKey, documentHash } from "./semantic/documents";
import { TAGS, type TagId } from "./taxonomy";
import type { CandidateDebug, EngineTimings, RecommendationResult, RetrievalQueryDebug, ScoredBook, Signals } from "./types";

/**
 * The pure recommendation engine: no network, no filesystem.
 *
 *   signals (derived reader profile) + candidate books
 *     → normalize (book profiles)      → hard filtering
 *     → metadata pre-score             → enrich the promising ones (injected)
 *     → embed the promising ones (injected, optional)
 *     → hybrid scoring                 → MMR diversity + roles
 *     → confidence                     → explanations
 *
 * Everything that touches the outside world (catalog APIs, the embedding model, caches) is injected
 * through `EngineOptions`, so the same code runs in tests with synthetic candidates and a fake embedder.
 */

export interface Embedder {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

export type EmbedKeyed = (embedder: Embedder, items: Array<{ key: string; text: string }>, budgetMs: number) => Promise<{ vectors: Map<string, number[]>; cacheHits: number; embedded: number }>;

export interface EngineOptions {
  embedder?: Embedder;
  /** Cache-aware batch embedding. Defaults to an in-memory implementation. */
  embedKeyed?: EmbedKeyed;
  /** Fetch descriptions / full subject lists for the most promising candidates. */
  enrich?: (books: Book[]) => Promise<Book[]>;
  /** Which retrieval routes surfaced each candidate. */
  routes?: Map<string, string[]>;
  queries?: RetrievalQueryDebug[];
  debug?: boolean;
  limit?: number;
  enrichCount?: number;
  embedCount?: number;
  embedBudgetMs?: number;
  /** 0 disables exploration slots. */
  explorationShare?: number;
}

const memoryVectors = new Map<string, number[]>();

/** Default embedding helper: batch the misses, remember results for the process lifetime. */
export const memoryEmbedKeyed: EmbedKeyed = async (embedder, items, budgetMs) => {
  const vectors = new Map<string, number[]>();
  const misses: Array<{ key: string; text: string }> = [];
  let cacheHits = 0;
  for (const item of items) {
    const hit = memoryVectors.get(item.key);
    if (hit) {
      vectors.set(item.key, hit);
      cacheHits++;
    } else if (!misses.some((m) => m.key === item.key)) misses.push(item);
  }
  let embedded = 0;
  if (misses.length) {
    const work = embedder.embed(misses.map((m) => m.text)).then((vs) => {
      vs.forEach((v, i) => {
        memoryVectors.set(misses[i].key, v);
        vectors.set(misses[i].key, v);
        embedded++;
      });
    });
    await Promise.race([work.catch(() => undefined), new Promise<void>((r) => setTimeout(r, budgetMs))]);
  }
  return { vectors, cacheHits, embedded };
};

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const ms = (t: number) => Math.round((now() - t) * 10) / 10;

/** Keep API payloads lean: the client needs subjects for display and feedback, not hundreds of headings. */
function slim(sb: ScoredBook): ScoredBook {
  return {
    ...sb,
    book: { ...sb.book, subjects: sb.book.subjects.slice(0, 24) },
    profile: { ...sb.profile, subjects: sb.profile.subjects.slice(0, 24) },
  };
}

export function isPersonal(s: Signals): boolean {
  return (
    s.moods.length + s.genres.length + s.goals.length + s.liked.length > 0 ||
    !!(s.freeText || s.pace || s.complexity || s.intensity || s.darkness || s.length || s.age || s.focus) ||
    Object.keys(s.avoidTags).length > 0
  );
}

function primaryNewConcept(sb: ScoredBook, s: Signals): string | undefined {
  const tag = (Object.entries(sb.profile.tags) as Array<[TagId, number]>)
    .filter(([id, v]) => v >= 0.5 && (s.positiveTags[id] ?? 0) < 0.3 && !["classics", "children", "erotica"].includes(id))
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  return tag ? TAGS[tag].label : undefined;
}

export async function recommendBooks(signals: Signals, candidates: Book[], opts: EngineOptions = {}): Promise<RecommendationResult> {
  const t0 = now();
  const timings: EngineTimings = { retrievalMs: 0, normalizeMs: 0, enrichMs: 0, embedMs: 0, scoringMs: 0, rerankMs: 0, totalMs: 0 };
  const dropped: CandidateDebug[] = [];

  /* 1. normalize + hard filters */
  let t = now();
  const profiled = candidates.map((book) => ({ book, profile: buildProfile(book) }));
  const filtered = applyHardFilters(profiled, signals);
  for (const d of filtered.dropped) {
    dropped.push({ id: d.item.book.id, title: d.item.book.title, author: d.item.book.authors[0] ?? "", final: 0, base: 0, components: {}, penaltyMultiplier: 0, penalties: [], routes: opts.routes?.get(d.item.book.id) ?? [], filtered: d.reason, selected: false });
  }
  let kept = filtered.kept;
  timings.normalizeMs = ms(t);

  /* 2. metadata pre-score to decide who deserves the expensive steps */
  const prelim = kept.map(({ book, profile }) => scoreBook(book, signals, profile)).sort((a, b) => b.score - a.score);

  /* 3 + 4. enrich the promising ones (descriptions, full subject lists) while embedding everything else.
   *  Batch 1 embeds the profile, the liked books and the candidates that will not be enriched; batch 2
   *  embeds the enriched candidates once their descriptions arrive. The two slow steps overlap. */
  const enrichCount = opts.enrich ? (opts.enrichCount ?? RETRIEVAL.enrichCount) : 0;
  const enrichIds = new Set(prelim.slice(0, enrichCount).map((sb) => sb.book.id));
  const tEnrich = now();
  const enrichment = opts.enrich
    ? opts
        .enrich(prelim.slice(0, enrichCount).map((sb) => sb.book))
        .catch(() => [] as Book[])
        .then((enriched) => {
          timings.enrichMs = ms(tEnrich);
          return new Map(enriched.map((b) => [b.id, b]));
        })
    : Promise.resolve(new Map<string, Book>());

  t = now();
  const ctx: ScoreContext = {};
  let semantic = { available: false, model: undefined as string | undefined, embedded: 0, cacheHits: 0 };
  let liked = signals.liked;
  const embedder = opts.embedder;
  const semanticOn = !!embedder && !!signals.semanticProfileText;
  const embed = opts.embedKeyed ?? memoryEmbedKeyed;
  const budget = opts.embedBudgetMs ?? RETRIEVAL.embedBudgetMs;
  const order = new Map(prelim.map((sb, i) => [sb.book.id, i]));
  const embedTargets = [...kept].sort((a, b) => (order.get(a.book.id) ?? 1e9) - (order.get(b.book.id) ?? 1e9)).slice(0, opts.embedCount ?? RETRIEVAL.embedCount);

  const profileKey = `profile:${documentHash(signals.semanticProfileText)}`;
  const negativeText = signals.negativeConcepts.length ? `Books about ${signals.negativeConcepts.join(", ")}` : "";
  const negativeKey = negativeText ? `negative:${documentHash(negativeText)}` : undefined;
  const likedItems = liked.map((l) => {
    const doc = `Title: ${l.title}\nAuthor: ${l.authors.join(", ")}\nSubjects: ${l.profile.subjects.slice(0, 24).join(", ")}\nThemes: ${l.concepts.join(", ")}`;
    return { key: `liked:${l.id}:${documentHash(doc)}`, text: doc };
  });

  let batch1: Promise<Awaited<ReturnType<EmbedKeyed>> | undefined> = Promise.resolve(undefined);
  if (semanticOn) {
    const items = [{ key: profileKey, text: signals.semanticProfileText }, ...likedItems];
    if (negativeKey) items.push({ key: negativeKey, text: negativeText });
    for (const k of embedTargets) if (!enrichIds.has(k.book.id)) items.push({ key: bookEmbeddingKey(k.book), text: bookDocument(k.book) });
    batch1 = embed(embedder!, items, budget).catch(() => undefined);
  }

  const enrichedById = await enrichment;
  kept = kept.map((k) => {
    const fresh = enrichedById.get(k.book.id);
    return fresh && fresh !== k.book ? { book: fresh, profile: buildProfile(fresh) } : k;
  });
  const keptById = new Map(kept.map((k) => [k.book.id, k]));

  if (semanticOn) {
    try {
      const first = await batch1;
      const items2 = embedTargets.filter((k) => enrichIds.has(k.book.id)).map((k) => keptById.get(k.book.id) ?? k).map((k) => ({ key: bookEmbeddingKey(k.book), text: bookDocument(k.book) }));
      const second = items2.length ? await embed(embedder!, items2, Math.max(500, budget - (now() - t))).catch(() => undefined) : undefined;
      const vectors = new Map<string, number[]>([...(first?.vectors ?? []), ...(second?.vectors ?? [])]);
      const profileVec = vectors.get(profileKey);
      if (profileVec) {
        ctx.profileEmbedding = profileVec;
        ctx.embeddings = new Map();
        for (const k of embedTargets) {
          const current = keptById.get(k.book.id) ?? k;
          const v = vectors.get(bookEmbeddingKey(current.book));
          if (v) ctx.embeddings.set(k.book.id, v);
        }
        if (negativeKey) ctx.negativeEmbedding = vectors.get(negativeKey);
        liked = liked.map((l, i) => ({ ...l, embedding: vectors.get(likedItems[i].key) }));
        semantic = {
          available: ctx.embeddings.size > 0,
          model: embedder!.model,
          embedded: (first?.embedded ?? 0) + (second?.embedded ?? 0),
          cacheHits: (first?.cacheHits ?? 0) + (second?.cacheHits ?? 0),
        };
      }
    } catch {
      /* semantic layer is optional */
    }
  }
  const s: Signals = { ...signals, liked, focus: signals.focus ? (liked.find((l) => l.id === signals.focus!.id) ?? signals.focus) : undefined };
  timings.embedMs = ms(t);

  /* 5. hybrid scoring */
  t = now();
  let scored = kept.map(({ book, profile }) => scoreBook(book, s, profile, ctx));
  if (ctx.embeddings) {
    // Candidates outside the embedded set get a neutral semantic value so the component never favors the un-embedded.
    const semanticValues = scored.filter((sb) => sb.components.semantic !== undefined).map((sb) => sb.components.semantic!);
    const neutral = semanticValues.length ? Math.max(0, semanticValues.reduce((a, b) => a + b, 0) / semanticValues.length - 0.1) : 0;
    scored = scored.map((sb) => {
      if (sb.components.semantic !== undefined) return sb;
      const imputed = { ...sb, components: { ...sb.components, semantic: Math.round(neutral * 1000) / 1000 } };
      // Re-run the weighted average with the imputed value by scaling the base score.
      return rescoreWithImputedSemantic(imputed, s, neutral);
    });
  }
  const percentiles = popularityPercentiles(kept.map((k) => k.book));
  scored = scored.map((sb) => ({ ...sb, routes: opts.routes?.get(sb.book.id) ?? [], popularityPercentile: percentiles.get(sb.book.id) }));
  timings.scoringMs = ms(t);

  /* 6. diversity, roles, quality bar */
  t = now();
  const sim = (a: ScoredBook, b: ScoredBook) => bookSimilarity({ profile: a.profile, embedding: ctx.embeddings?.get(a.book.id) }, { profile: b.profile, embedding: ctx.embeddings?.get(b.book.id) });
  const rctx: RerankContext = {
    likedIds: s.liked.map((l) => l.id),
    likedTitles: s.liked.map((l) => l.title),
    likedAuthors: s.likedAuthors,
    similarity: sim,
    maxResults: opts.limit,
    explorationShare: opts.explorationShare,
    targets: { complexity: s.complexity && !s.complexity.inferred ? s.complexity.target : undefined, pace: s.pace && !s.pace.inferred ? s.pace.target : undefined },
  };
  const positiveTags = new Set(Object.keys(s.positiveTags).filter((k) => (s.positiveTags[k as TagId] ?? 0) >= 0.3));
  const selection = rerank(scored, rctx, positiveTags);
  timings.rerankMs = ms(t);

  /* 7. confidence + explanations */
  const conf = computeConfidence(selection.recommendations, s, selection.relaxed);
  const personal = isPersonal(s);
  const top = selection.recommendations[0]?.score ?? 0;
  const finish = (sb: ScoredBook): ScoredBook => {
    const confidence = pickConfidence(sb, top, conf.score);
    const explanation = buildExplanation(sb, s, confidence, primaryNewConcept(sb, s));
    return slim({ ...sb, confidence, explanation, tradeoffs: explanation.tradeoffs, matchedSignals: sb.matched });
  };
  const recommendations = selection.recommendations.map(finish);
  const reserve = selection.reserve.map(finish);
  const shipped = [...recommendations, ...reserve];
  const similarity = similarityMatrix(shipped, sim);

  let summary: string;
  if (!personal && recommendations.length) summary = "You didn't set any preferences, so these are widely loved books to start from. Tell us a little more for sharper picks.";
  else if (!recommendations.length) summary = "We couldn't find a strong match yet. Try broadening your preferences.";
  else if (conf.level === "low") summary = "We found a few interesting possibilities, but your preferences were broad, so treat these as starting points.";
  else summary = featuredNarrative(recommendations[0], s);
  const profileSummary = personal && recommendations.length ? profileNarrative(s, recommendations, conf.clearWinner) : summary;

  timings.totalMs = ms(t0);
  const result: RecommendationResult = {
    recommendations,
    reserve,
    confidence: personal ? conf.level : "low",
    mode: personal ? "personal" : "broad",
    summary,
    chips: signalChips(s),
    poolSize: candidates.length,
    engineVersion: ENGINE_VERSION,
    confidenceScore: personal ? conf.score : Math.min(conf.score, 0.3),
    clearWinner: conf.clearWinner,
    profileSummary,
    conflicts: s.conflicts,
    similarity,
    semantic: semantic.available,
    hints: { complexityTarget: rctx.targets?.complexity, paceTarget: rctx.targets?.pace, explorationShare: opts.explorationShare },
  };

  if (opts.debug) {
    const selected = new Set(recommendations.map((r) => r.book.id));
    const candidatesDebug: CandidateDebug[] = [...scored]
      .sort((a, b) => b.score - a.score)
      .map((sb) => ({
        id: sb.book.id,
        title: sb.book.title,
        author: sb.book.authors[0] ?? "",
        final: sb.score,
        base: sb.baseScore,
        components: sb.components,
        penaltyMultiplier: sb.baseScore ? Math.round((sb.score / sb.baseScore) * 1000) / 1000 : 0,
        penalties: sb.penalties,
        routes: sb.routes ?? [],
        role: recommendations.find((r) => r.book.id === sb.book.id)?.role,
        novelty: sb.novelty,
        familiarity: sb.familiarity,
        semanticCosine: sb.semanticCosine,
        selected: selected.has(sb.book.id),
      }));
    const { liked: likedSignals, focus: _focus, ...rest } = s;
    void _focus;
    result.debug = {
      timings,
      queries: opts.queries ?? [],
      semantic,
      poolSize: candidates.length,
      filtered: filtered.dropped.length,
      candidates: [...candidatesDebug, ...dropped],
      signals: { ...rest, liked: likedSignals.map(({ embedding: _e, profile: _p, ...l }) => (void _e, void _p, l)) },
    };
  }
  return result;
}

/** Re-derive the final score after imputing a semantic value for a book that was not embedded. */
function rescoreWithImputedSemantic(sb: ScoredBook, s: Signals, neutral: number): ScoredBook {
  // weightedScore is Σ w·v / Σ w; adding one component (w_s, v_s) moves it to (num + w_s·v_s)/(den + w_s).
  // We don't have num/den here, but base = num/den and the weights are known, so reconstruct them.
  let den = 0;
  for (const k of Object.keys(sb.components) as Array<keyof typeof SCORE_WEIGHTS>) {
    if (k === "semantic") continue;
    den += SCORE_WEIGHTS[k] * PRIORITY_MULTIPLIER[priorityOf(s, k)];
  }
  const ws = SCORE_WEIGHTS.semantic * PRIORITY_MULTIPLIER[priorityOf(s, "semantic")];
  const penalty = sb.baseScore ? sb.score / sb.baseScore : 1;
  const base = den + ws ? (sb.baseScore * den + ws * neutral) / (den + ws) : sb.baseScore;
  return { ...sb, baseScore: Math.round(base * 1000) / 1000, score: Math.round(base * penalty * 1000) / 1000 };
}
