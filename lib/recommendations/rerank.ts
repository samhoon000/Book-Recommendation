import { normalizeTitle } from "@/lib/api/dedupe";
import { ROLES, SELECTION } from "./config";
import { bookSimilarity, subjectOverlap } from "./profile";
import { TAGS, type TagId } from "./taxonomy";
import { ROLE_LABEL, type Confidence, type RecommendationRole, type ScoredBook, type SimilarityMatrix } from "./types";

/**
 * Isomorphic reranking: diversity (MMR), author caps, exploration slots, roles and the quality bar.
 * Runs on the server for the first ranking and again in the browser after "Not for me" feedback,
 * so it must not import anything server-only.
 */

export interface RerankContext {
  likedIds: string[];
  likedTitles: string[];
  likedAuthors: string[];
  excludeIds?: string[];
  /** Pairwise similarity source: a matrix shipped with the result, or a function (server side, with embeddings). */
  similarity?: SimilarityMatrix | ((a: ScoredBook, b: ScoredBook) => number);
  maxResults?: number;
  /** 0 disables exploration slots (e.g. "more like this"). */
  explorationShare?: number;
  /** User-chosen complexity / pace targets, for the "challenge" role. */
  targets?: { complexity?: number; pace?: number };
}

export interface Rerank {
  recommendations: ScoredBook[];
  reserve: ScoredBook[];
  confidence: Confidence;
  relaxed: boolean;
}

/**
 * "Dune Messiah" by the author of Dune, or "Sandworms of Dune" by someone else but filed under
 * "Dune (Imaginary place)": continuations of a book the reader already listed are not discoveries.
 */
function isSeriesSibling(sb: ScoredBook, likedAuthors: string[], likedTitles: string[]): boolean {
  const title = ` ${normalizeTitle(sb.book.title)} `;
  const authors = sb.book.authors.map((a) => a.toLowerCase());
  const sameAuthor = authors.some((a) => likedAuthors.includes(a));
  const description = sb.book.description ?? "";
  return likedTitles.some((t) => {
    if (t.length < 4) return false;
    if (title.includes(` ${t} `) && sameAuthor) return true;
    // Catalog headings name the universe: "dune imaginary place", "mistborn imaginary place", "harry potter fictitious character".
    const key = t.split(" ").find((w) => w.length >= 4 && !SERIES_STOP.has(w));
    if (sb.profile.subjects.some((subj) => (` ${subj} `.includes(` ${t} `) || (!!key && ` ${subj} `.includes(` ${key} `))) && /imaginary|fictitious|series|universe|saga|fictional/.test(subj))) return true;
    // Same author, and the description uses the liked title as a proper noun mid-sentence ("the most powerful Mistborn in the land").
    if (sameAuthor && key && key.length >= 5) {
      const proper = new RegExp(`[a-z,;:]\\s+${key.charAt(0).toUpperCase()}${key.slice(1)}\\b`);
      if (proper.test(description)) return true;
    }
    return false;
  });
}

const SERIES_STOP = new Set(["the", "and", "with", "from", "into", "book", "final", "first", "last", "story", "stories", "novel", "tale", "tales", "house", "world"]);

const LATER_VOLUME_TEXT =
  /\b(second|third|fourth|fifth|sixth|seventh|eighth|ninth|final|last|concluding|penultimate) (book|novel|volume|instal?lment|entry|part)\b|\bsequel to\b|\bpreceded by\b|\bconclusion (to|of) (the|a|an|his|her|this)\b|\bbook (two|three|four|five|six|2|3|4|5|6)\b|\bvolume (two|three|four|2|3|4)\b|\bcontinues the (story|saga|adventures?)\b|\bpicks up where\b/i;

/**
 * "Book 3", "Vol. 2", "#4", a catalog title that says so, or a description that says "the third book in…":
 * a later volume, rarely where a reader should start.
 */
export function laterVolume(title: string, description?: string, catalogVolume?: number): number | undefined {
  if (catalogVolume && catalogVolume >= 2) return catalogVolume;
  const m = title.match(/\b(?:book|vol\.?|volume|part|#)\s*(\d{1,2})\b/i) ?? title.match(/\(([^)]*?)\s*#?(\d{1,2})\)/);
  const n = m ? Number(m[m.length - 1]) : undefined;
  if (n !== undefined && n >= 2) return n;
  if (description && LATER_VOLUME_TEXT.test(description.slice(0, 600))) return 2;
  return undefined;
}

/** "Dune Messiah" / "Children of Dune" by the same author as another candidate titled "Dune". */
function sameSeries(a: ScoredBook, b: ScoredBook): boolean {
  const authorA = a.book.authors[0]?.toLowerCase();
  if (!authorA || authorA !== b.book.authors[0]?.toLowerCase()) return false;
  const ta = normalizeTitle(a.book.title);
  const tb = normalizeTitle(b.book.title);
  if (!ta || !tb) return false;
  const short = ta.length <= tb.length ? ta : tb;
  const long = ta.length <= tb.length ? tb : ta;
  return short.split(" ")[0].length >= 4 && ` ${long} `.includes(` ${short} `) || /\b(book|vol|volume|part)\s*\d+\b/.test(`${ta} ${tb}`);
}

function similarityFn(ctx: RerankContext): (a: ScoredBook, b: ScoredBook) => number {
  if (typeof ctx.similarity === "function") return ctx.similarity;
  if (ctx.similarity) {
    const index = new Map(ctx.similarity.ids.map((id, i) => [id, i]));
    const rows = ctx.similarity.rows;
    return (a, b) => {
      const i = index.get(a.book.id);
      const j = index.get(b.book.id);
      return i !== undefined && j !== undefined ? (rows[i]?.[j] ?? bookSimilarity(a, b)) : bookSimilarity(a, b);
    };
  }
  return (a, b) => bookSimilarity(a, b);
}

/** True when a candidate would make a reasonable exploration pick: new ground, still relevant. */
function explorationEligible(sb: ScoredBook, top: number): boolean {
  if (sb.score < top * SELECTION.explorationFloor) return false;
  const onlyExploration = !!sb.routes?.length && sb.routes.every((r) => r === "exploration");
  return onlyExploration || (sb.novelty ?? 0) >= ROLES.fresh.minNovelty;
}

/**
 * Maximal Marginal Relevance with constraints:
 *   value = score − λ × max(similarity to already chosen)
 * One book per author, no two volumes of one series, and a share of the slots reserved for
 * exploration picks that still clear the relevance floor.
 */
export function mmrSelect(sorted: ScoredBook[], ctx: RerankContext, n: number): { picks: ScoredBook[]; rest: ScoredBook[] } {
  const sim = similarityFn(ctx);
  const picks: ScoredBook[] = [];
  const remaining = [...sorted];
  const perAuthor = new Map<string, number>();
  const seenTitles = new Set<string>();
  const top = sorted[0]?.score ?? 0;
  const explorationShare = ctx.explorationShare ?? SELECTION.explorationShare;
  const explorationSlots = Math.max(0, Math.round(n * explorationShare));
  let explorationUsed = 0;

  const allowed = (sb: ScoredBook) => {
    const author = sb.book.authors[0]?.toLowerCase() ?? sb.book.id;
    if ((perAuthor.get(author) ?? 0) >= SELECTION.maxPerAuthor) return false;
    if (seenTitles.has(normalizeTitle(sb.book.title))) return false;
    if (picks.some((p) => sameSeries(p, sb))) return false;
    return true;
  };

  while (picks.length < n && remaining.length) {
    const familiarSlotsLeft = n - picks.length - (explorationSlots - explorationUsed);
    // Once the familiar slots are spoken for, the next slot is reserved for exploration if anyone qualifies.
    const wantExploration = explorationSlots > explorationUsed && familiarSlotsLeft <= 0;
    let bestIdx = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const sb = remaining[i];
      if (!allowed(sb)) continue;
      if (wantExploration && !explorationEligible(sb, top)) continue;
      const maxSim = picks.length ? Math.max(...picks.map((p) => sim(p, sb))) : 0;
      if (maxSim >= SELECTION.nearDuplicate) continue;
      const value = sb.score - SELECTION.mmrLambda * maxSim;
      if (value > bestVal) {
        bestVal = value;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) {
      if (wantExploration) {
        // Nobody qualified for exploration: give the slot back to the familiar side.
        explorationUsed++;
        continue;
      }
      break;
    }
    // Prefer the representative volume: among near-equal candidates from the same series, the one most readers know.
    let chosenIdx = bestIdx;
    const best = remaining[bestIdx];
    const bestAuthor = best.book.authors[0]?.toLowerCase();
    if (bestAuthor) {
      const interest = (sb: ScoredBook) => (sb.book.readerCount ?? 0) + (sb.book.rating?.count ?? 0);
      for (let i = 0; i < remaining.length; i++) {
        const alt = remaining[i];
        if (i === chosenIdx || alt.book.authors[0]?.toLowerCase() !== bestAuthor) continue;
        const related = sameSeries(best, alt) || subjectOverlap(best.profile.subjects, alt.profile.subjects).score >= 0.45;
        if (related && alt.score >= best.score - 0.08 && interest(alt) > interest(remaining[chosenIdx]) * 1.5 && !laterVolume(alt.book.title, alt.book.description, alt.book.seriesVolume)) chosenIdx = i;
      }
    }
    const [chosen] = remaining.splice(chosenIdx, 1);
    picks.push(chosen);
    perAuthor.set(chosen.book.authors[0]?.toLowerCase() ?? chosen.book.id, (perAuthor.get(chosen.book.authors[0]?.toLowerCase() ?? chosen.book.id) ?? 0) + 1);
    seenTitles.add(normalizeTitle(chosen.book.title));
    if (explorationEligible(chosen, top) && picks.length > 1) explorationUsed++;
  }
  return { picks, rest: remaining };
}

function primaryNewConcept(sb: ScoredBook, positive: Set<string>): string | undefined {
  const tag = (Object.entries(sb.profile.tags) as Array<[TagId, number]>)
    .filter(([id, v]) => v >= 0.5 && !positive.has(id) && !["classics", "children", "erotica"].includes(id))
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  return tag ? TAGS[tag].label : undefined;
}

/** Give every pick a role. The first is always the top match; the special roles are handed out once each. */
export function assignRoles(picks: ScoredBook[], ctx: RerankContext, positiveTags: Set<string> = new Set()): ScoredBook[] {
  if (!picks.length) return picks;
  const top = picks[0].score;
  const taken = new Set<RecommendationRole>(["perfect"]);
  const out = picks.map((p) => ({ ...p }));
  out[0].role = "perfect";

  const candidatesFor = (role: RecommendationRole, test: (sb: ScoredBook) => number): void => {
    if (taken.has(role)) return;
    let best: ScoredBook | undefined;
    let bestVal = 0;
    for (const sb of out.slice(1)) {
      if (sb.role) continue;
      const v = test(sb);
      if (v > bestVal) {
        bestVal = v;
        best = sb;
      }
    }
    if (best) {
      best.role = role;
      taken.add(role);
    }
  };

  candidatesFor("hiddenGem", (sb) => {
    const pop = sb.popularityPercentile;
    const rating = sb.book.rating;
    if (pop === undefined || pop > ROLES.hiddenGem.maxPopularityPercentile) return 0;
    if (sb.score < top * ROLES.hiddenGem.minScoreShare) return 0;
    // "Highly rated by the readers who found it" needs actual ratings behind it.
    if (!rating || rating.count < ROLES.hiddenGem.minRatings || rating.average < ROLES.hiddenGem.minRating) return 0;
    return (1 - pop) * sb.score;
  });
  candidatesFor("wildcard", (sb) => ((sb.novelty ?? 0) >= ROLES.wildcard.minNovelty && (sb.familiarity ?? 1) <= ROLES.wildcard.maxFamiliarity ? (sb.novelty ?? 0) : 0));
  candidatesFor("challenge", (sb) => {
    const c = ctx.targets?.complexity;
    const p = ctx.targets?.pace;
    let v = 0;
    if (c !== undefined && sb.profile.complexity.confidence >= ROLES.challenge.minConfidence && sb.profile.complexity.value - c >= ROLES.challenge.complexityGap) v = Math.max(v, sb.profile.complexity.value - c);
    if (p !== undefined && sb.profile.pace.confidence >= ROLES.challenge.minConfidence && p - sb.profile.pace.value >= ROLES.challenge.paceGap) v = Math.max(v, p - sb.profile.pace.value);
    return v;
  });
  candidatesFor("fresh", (sb) => ((sb.novelty ?? 0) >= ROLES.fresh.minNovelty && (sb.familiarity ?? 0) >= ROLES.fresh.minFamiliarity ? (sb.novelty ?? 0) * (sb.familiarity ?? 0) : 0));
  candidatesFor("safe", (sb) => ((sb.familiarity ?? 0) >= ROLES.safe.minFamiliarity ? (sb.familiarity ?? 0) * sb.score : 0));

  for (const sb of out) {
    if (!sb.role) sb.role = sb.score >= 0.64 ? "strong" : "good";
    sb.roleLabel = ROLE_LABEL[sb.role];
    if ((sb.role === "wildcard" || sb.role === "fresh") && sb.explanation && !sb.explanation.explorationReason && positiveTags.size) {
      const concept = primaryNewConcept(sb, positiveTags);
      if (concept) sb.explanation.explorationReason = `It brings in ${concept}, which is new relative to what you asked for.`;
    }
  }
  return out;
}

/** Rank, diversify and cut at a quality bar. Prefers five strong picks to ten weak ones. */
export function rerank(pool: ScoredBook[], ctx: RerankContext, positiveTags: Set<string> = new Set()): Rerank {
  const exclude = new Set([...ctx.likedIds, ...(ctx.excludeIds ?? [])]);
  const likedTitles = ctx.likedTitles.map(normalizeTitle);
  const sorted = pool
    .filter((sb) => !exclude.has(sb.book.id) && !likedTitles.includes(normalizeTitle(sb.book.title)))
    .filter((sb) => !isSeriesSibling(sb, ctx.likedAuthors, likedTitles))
    .sort((a, b) => b.score - a.score);

  const maxResults = ctx.maxResults ?? SELECTION.maxResults;
  const eligible = sorted.filter((sb) => sb.score >= SELECTION.minScore);
  let { picks } = mmrSelect(eligible, ctx, maxResults);
  let relaxed = false;
  if (picks.length < SELECTION.minDesired) {
    const loose = sorted.filter((sb) => sb.score >= SELECTION.fallbackMinScore);
    picks = mmrSelect(loose, ctx, Math.max(picks.length, SELECTION.minDesired + 1)).picks;
    relaxed = true;
  }
  // MMR chooses the set; the list itself is shown in score order so the match meter reads top-down.
  picks.sort((a, b) => b.score - a.score);
  picks = assignRoles(picks, ctx, positiveTags);
  const pickedIds = new Set(picks.map((p) => p.book.id));
  const reserve = sorted.filter((sb) => !pickedIds.has(sb.book.id) && sb.score >= SELECTION.fallbackMinScore).slice(0, SELECTION.reserveSize);

  const top = picks[0]?.score ?? 0;
  const confidence: Confidence =
    !relaxed && top >= SELECTION.confidentTopScore && picks.length >= SELECTION.minDesired ? "high" : top >= 0.5 && picks.length >= 3 ? "medium" : "low";
  return { recommendations: picks, reserve, confidence, relaxed };
}

/** Pairwise similarity of a small set, for shipping to the browser. */
export function similarityMatrix(items: ScoredBook[], sim: (a: ScoredBook, b: ScoredBook) => number): SimilarityMatrix {
  const ids = items.map((i) => i.book.id);
  const rows = items.map((a) => items.map((b) => (a === b ? 1 : Math.round(sim(a, b) * 100) / 100)));
  return { ids, rows };
}
