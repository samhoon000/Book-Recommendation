import type { Book } from "@/types/book";
import { buildProfile, subjectOverlap, tagAssociation, tagCosine, vectorCosine } from "./profile";
import { TAGS, type TagId, type WeightedTags } from "./taxonomy";
import type { BookProfile, ScoredBook, Signals } from "./types";
import { FOCUS_BLEND, LIKED_AGGREGATION, NEGATIVE, PRIORITY_MULTIPLIER, SCORE_WEIGHTS, SELECTION, SEMANTIC_CALIBRATION, type ScoreComponent } from "./config";
import { metadataQuality, qualityScore } from "./quality";
import { laterVolume } from "./rerank";
import { explain } from "./explain";
import { priorityOf } from "./preferenceMapper";

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** "Soft OR" of a weighted tag set against a profile: several partial matches add up, but never past 1. */
export function softMatch(want: WeightedTags, have: WeightedTags): { score: number; best: TagId | undefined } {
  let miss = 1;
  let best: TagId | undefined;
  let bestVal = 0;
  for (const [tag, w] of Object.entries(want) as Array<[TagId, number]>) {
    const v = (have[tag] ?? 0) * w;
    miss *= 1 - v;
    if (v > bestVal) {
      bestVal = v;
      best = tag;
    }
  }
  return { score: 1 - miss, best };
}

function combineGroups(scores: number[]): number {
  if (!scores.length) return 0;
  const max = Math.max(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  // Two moods means the reader wants both: the best one leads, but the average has a real say.
  return clamp(0.55 * max + 0.45 * mean);
}

function closeness(est: { value: number; confidence: number }, target: number): number {
  const raw = 1 - Math.min(1, Math.abs(est.value - target) * 1.4);
  return 0.5 + (raw - 0.5) * clamp(est.confidence + 0.15);
}

function lengthMatch(pages: number | undefined, range: { min: number; max: number }): number | undefined {
  if (!pages) return undefined;
  if (pages >= range.min && pages <= range.max) return 1;
  const dist = pages < range.min ? range.min - pages : pages - range.max;
  return clamp(1 - dist / 160);
}

/** Map a raw cosine onto 0..1 using a calibration window. */
export function calibrate(cosine: number, window: { low: number; high: number }): number {
  return clamp((cosine - window.low) / (window.high - window.low));
}

function termHits(terms: string[], book: Book, profile: BookProfile): { subjects: string[]; description: string[] } {
  const subjectHay = profile.subjects.join(" | ");
  const descHay = `${book.title.toLowerCase()} | ${(book.description ?? "").toLowerCase()}`;
  const subjects: string[] = [];
  const description: string[] = [];
  for (const t of terms) {
    const re = new RegExp(`\\b${t.replace(/[^a-z0-9]/g, "")}`);
    if (re.test(subjectHay)) subjects.push(t);
    else if (re.test(descHay)) description.push(t);
  }
  return { subjects, description };
}

export interface ComponentDetail {
  value: number;
  /** Supporting data for explanations. */
  note?: Record<string, unknown>;
}

export type ComponentMap = Partial<Record<ScoreComponent, ComponentDetail>>;

/** Per-request data the scorer needs beyond the signals: embeddings, when the semantic engine ran. */
export interface ScoreContext {
  embeddings?: Map<string, number[]>;
  profileEmbedding?: number[];
  negativeEmbedding?: number[];
}

export interface LikedMatch {
  id: string;
  title: string;
  origin: "liked" | "reference" | "focus";
  sim: number;
  metadataSim: number;
  semanticSim?: number;
  shared: string[];
  sharedTags: TagId[];
}

export function likedSimilarity(profile: BookProfile, liked: Signals["liked"][number], embedding: number[] | undefined): LikedMatch {
  const tagSim = tagCosine(profile.tags, liked.profile.tags);
  const overlap = subjectOverlap(profile.subjects, liked.profile.subjects);
  const metadataSim = clamp((0.6 * tagSim + 0.4 * Math.min(1, overlap.score * 2.2)) * 1.25);
  let sim = metadataSim;
  let semanticSim: number | undefined;
  if (embedding && liked.embedding) {
    semanticSim = calibrate(vectorCosine(embedding, liked.embedding), SEMANTIC_CALIBRATION.likedBook);
    sim = clamp((1 - SEMANTIC_CALIBRATION.likedSemanticShare) * metadataSim + SEMANTIC_CALIBRATION.likedSemanticShare * semanticSim);
  }
  const sharedTags = (Object.keys(liked.profile.tags) as TagId[])
    .filter((t) => (profile.tags[t] ?? 0) > 0.45 && (liked.profile.tags[t] ?? 0) > 0.45)
    .sort((a, b) => (profile.tags[b] ?? 0) + (liked.profile.tags[b] ?? 0) - (profile.tags[a] ?? 0) - (liked.profile.tags[a] ?? 0));
  return { id: liked.id, title: liked.title, origin: liked.origin, sim, metadataSim, semanticSim, shared: overlap.shared.slice(0, 3), sharedTags: sharedTags.slice(0, 3) };
}

/** Compute every component the reader actually expressed a preference for. All values 0..1. */
export function scoreComponents(book: Book, profile: BookProfile, s: Signals, ctx: ScoreContext = {}): ComponentMap {
  const c: ComponentMap = {};
  const tags = profile.tags;
  const embedding = ctx.embeddings?.get(book.id);

  if (s.moods.length) {
    const per = s.moods.map((m) => {
      const hit = softMatch(m.tags, tags);
      const against = m.counter ? softMatch(m.counter, tags).score : 0;
      return { chip: m.chip, best: hit.best, score: hit.score * (1 - 0.7 * against) };
    });
    c.moodMatch = { value: combineGroups(per.map((p) => p.score)), note: { per } };
  }

  if (s.genres.length) {
    const per = s.genres.map((g) => {
      const m = softMatch(g.tags, tags);
      // A non-fiction book on a fiction genre (or vice versa) is a weak match at best.
      const mismatch = g.fiction ? profile.isNonfiction && !profile.isFiction : profile.isFiction;
      return { chip: g.chip, score: mismatch ? m.score * 0.4 : m.score, best: m.best };
    });
    const sorted = per.map((p) => p.score).sort((a, b) => b - a);
    const value = clamp(sorted[0] + 0.15 * (sorted[1] ?? 0));
    c.genreMatch = { value, note: { per } };
  }

  const likedSet = s.liked.filter((l) => l.origin !== "focus");
  if (likedSet.length) {
    const per = likedSet.map((l) => ({ ...likedSimilarity(profile, l, embedding), weight: l.weight }));
    // One favorite should not dominate: the best match leads, the average of the top two tempers it.
    const sims = per.map((p) => p.sim * Math.min(1, p.weight)).sort((a, b) => b - a);
    const top2 = sims.slice(0, 2);
    const value = clamp(LIKED_AGGREGATION.maxShare * sims[0] + (1 - LIKED_AGGREGATION.maxShare) * (top2.reduce((a, b) => a + b, 0) / top2.length));
    c.likedBookSimilarity = { value, note: { per } };
  }

  if (Object.keys(s.themes).length) {
    const m = softMatch(s.themes, tags);
    c.themeMatch = { value: m.score, note: { best: m.best } };
  }

  if (s.goals.length) {
    const per = s.goals.map((g) => ({ chip: g.chip, ...softMatch(g.tags, tags) }));
    c.goalMatch = { value: combineGroups(per.map((p) => p.score)), note: { per } };
  }

  if (s.pace || s.avoidSlow) {
    const target = s.pace?.target ?? 0.7;
    c.paceMatch = { value: closeness(profile.pace, target), note: { estimate: profile.pace, target } };
  }

  if (s.complexity || s.avoidComplex) {
    const target = s.complexity?.target ?? 0.3;
    c.complexityMatch = { value: closeness(profile.complexity, target), note: { estimate: profile.complexity, target } };
  }

  if (s.length || s.avoidLong) {
    const range = s.length ?? { min: 0, max: 380 };
    const v = lengthMatch(book.pageCount, range);
    c.lengthMatch = { value: v ?? 0.5, note: { pages: book.pageCount, known: v !== undefined, range } };
  }

  if (s.intensity || s.darkness) {
    const parts: number[] = [];
    if (s.intensity) parts.push(closeness(profile.intensity, s.intensity.target));
    if (s.darkness) parts.push(closeness(profile.darkness, s.darkness.target));
    c.toneMatch = { value: parts.reduce((a, b) => a + b, 0) / parts.length };
  }

  if (s.age) {
    const ya = Math.max(tags.ya ?? 0, tags.comingofage ? tags.comingofage * 0.5 : 0);
    c.maturityMatch = { value: s.age === "ya" ? clamp(0.25 + 0.75 * ya) : clamp(1 - 0.8 * ya) };
  }

  if (s.freeText) {
    // Every phrase should be satisfied: "Black Mirror" and "philosophical", not one or the other.
    const groupScores = s.freeText.groups.map((g) => softMatch(g, tags).score);
    const tagPart = groupScores.length ? 0.35 * Math.max(...groupScores) + 0.65 * (groupScores.reduce((a, b) => a + b, 0) / groupScores.length) : undefined;
    const hits = termHits(s.freeText.terms, book, profile);
    const hitList = [...hits.subjects, ...hits.description];
    const termPart = s.freeText.terms.length ? (hits.subjects.length + 0.7 * hits.description.length) / s.freeText.terms.length : undefined;
    const value = tagPart !== undefined && termPart !== undefined ? 0.7 * tagPart + 0.3 * termPart : (tagPart ?? termPart ?? 0);
    c.freeTextMatch = { value: clamp(value), note: { hits: hitList } };
  }

  if (ctx.profileEmbedding && embedding) {
    const cosine = vectorCosine(embedding, ctx.profileEmbedding);
    c.semantic = { value: calibrate(cosine, SEMANTIC_CALIBRATION.profile), note: { cosine } };
  }

  const mq = metadataQuality(book);
  c.metadataQuality = { value: mq.score, note: { missing: mq.missing } };
  c.quality = { value: qualityScore(book, s.qualityMode), note: { rating: book.rating, readers: book.readerCount } };
  return c;
}

export interface PenaltyResult {
  multiplier: number;
  notes: string[];
}

/** Multiplicative penalties for things the reader asked us to avoid, and for poor fit with the fiction lean. */
export function penalties(book: Book, profile: BookProfile, s: Signals, ctx: ScoreContext = {}): PenaltyResult {
  let m = 1;
  const notes: string[] = [];
  for (const [tag, w] of Object.entries(s.avoidTags) as Array<[TagId, number]>) {
    // Penalize on the evidence: two subjects or a dominant genre hit hard, one stray heading much less.
    const assoc = tagAssociation(profile, tag);
    if (assoc > 0) {
      m *= 1 - NEGATIVE.softStrength * assoc * w;
      notes.push(`touches on ${TAGS[tag].label}`);
    }
  }
  if (s.avoidTerms.length) {
    const hits = termHits(s.avoidTerms, book, profile);
    if (hits.subjects.length) {
      m *= Math.pow(NEGATIVE.termInSubjects, hits.subjects.length);
      notes.push(`is catalogued under ${hits.subjects.join(", ")}`);
    }
    if (hits.description.length) {
      m *= Math.pow(NEGATIVE.termInDescription, hits.description.length);
      notes.push(`mentions ${hits.description.join(", ")}`);
    }
  }
  if (s.avoidSlow && profile.pace.value < 0.4 && profile.pace.confidence > 0.3) {
    m *= 0.6;
    notes.push("looks slow-paced");
  }
  if (s.avoidComplex && profile.complexity.value > 0.65 && profile.complexity.confidence > 0.3) {
    m *= 0.6;
    notes.push("looks demanding");
  }
  if (s.avoidLong && book.pageCount && book.pageCount > 420) {
    m *= 0.55;
    notes.push(`runs long (${book.pageCount} pages)`);
  }

  // Explicit books only when the reader asked for them in their own words.
  const explicit = profile.tags.erotica ?? 0;
  if (explicit > 0.4 && !(s.freeText?.tags.erotica || s.moods.some((m) => m.tags.erotica))) m *= 1 - 0.6 * explicit;

  // Juvenile headings are a soft miss for adult readers (clear children's books are filtered out earlier).
  const kids = tagAssociation(profile, "children");
  if (kids >= 0.55 && s.age !== "ya") m *= 1 - 0.45 * kids;
  if (s.age === "adult") m *= 1 - 0.5 * (profile.tags.ya ?? 0);

  // Lean toward fiction or non-fiction when the reader made that clear.
  if (s.fictionLean >= 0.5 && profile.isNonfiction && !profile.isFiction) {
    m *= 0.72;
    notes.push("is non-fiction");
  }
  if (s.fictionLean <= -0.5 && profile.isFiction) {
    m *= 0.72;
    notes.push("is fiction");
  }

  if (s.likedAuthors.length && book.authors.some((a) => s.likedAuthors.includes(a.toLowerCase()))) m *= SELECTION.likedAuthorPenalty;
  if (profile.thin) m *= 0.95;
  // A record with neither cover nor description is hard to present and hard to trust.
  if (!book.coverUrl && !book.description) m *= 0.85;
  const volume = laterVolume(book.title, book.description, book.seriesVolume);
  if (volume) {
    m *= 0.6;
    notes.push(`is volume ${volume} of a series`);
  }

  // Semantic distance to what the reader ruled out ("nothing bleak"): precise tag penalties above, a gist check here.
  const embedding = ctx.embeddings?.get(book.id);
  if (ctx.negativeEmbedding && embedding) {
    const cosine = vectorCosine(embedding, ctx.negativeEmbedding);
    if (cosine > NEGATIVE.semanticThreshold) {
      m *= clamp(1 - (cosine - NEGATIVE.semanticThreshold) * NEGATIVE.semanticStrength, 0.3, 1);
      notes.push("reads close to what you asked to avoid");
    }
  }
  return { multiplier: clamp(m), notes };
}

/** Σ(weight × priority × value) / Σ(weight × priority) over the components present. */
export function weightedScore(components: ComponentMap, s?: Signals): number {
  let num = 0;
  let den = 0;
  for (const [k, d] of Object.entries(components) as Array<[ScoreComponent, ComponentDetail]>) {
    const w = SCORE_WEIGHTS[k] * (s ? PRIORITY_MULTIPLIER[priorityOf(s, k)] : 1);
    num += w * d.value;
    den += w;
  }
  return den ? num / den : 0;
}

/** How close the book sits to what the reader already said they like (0..1), and how much of it is new. */
export function noveltyAndFamiliarity(profile: BookProfile, s: Signals): { novelty: number; familiarity: number } {
  const positive = s.positiveTags;
  if (!Object.keys(positive).length) return { novelty: 0, familiarity: 0.5 };
  const familiarity = softMatch(positive, profile.tags).score;
  let novelty = 0;
  for (const [tag, v] of Object.entries(profile.tags) as Array<[TagId, number]>) {
    if (v < 0.5 || TAGS[tag].kind !== "genre" && v < 0.6) continue;
    if (tag === "classics" || tag === "children" || tag === "erotica") continue;
    const known = positive[tag] ?? 0;
    if (known < 0.3) novelty = Math.max(novelty, v * (1 - known));
  }
  return { novelty: clamp(novelty), familiarity: clamp(familiarity) };
}

/** Score one book against the reader's signals, with an explanation built from the same numbers. */
export function scoreBook(book: Book, s: Signals, profile: BookProfile = buildProfile(book), ctx: ScoreContext = {}): ScoredBook {
  const components = scoreComponents(book, profile, s, ctx);
  let base = weightedScore(components, s);
  let focusSim: number | undefined;
  if (s.focus) {
    // "More like this": similarity to the chosen book leads, the original profile keeps its say.
    focusSim = likedSimilarity(profile, s.focus, ctx.embeddings?.get(book.id)).sim;
    const profileShare = FOCUS_BLEND.profile * Math.min(1, s.completeness / 0.5);
    base = (1 - profileShare) * focusSim + profileShare * base;
  }
  const pen = penalties(book, profile, s, ctx);
  const score = Math.round(base * pen.multiplier * 1000) / 1000;
  const { reasons, matched } = explain(book, profile, components, s, focusSim);
  const { novelty, familiarity } = noveltyAndFamiliarity(profile, s);
  return {
    book,
    score,
    baseScore: Math.round(base * 1000) / 1000,
    components: Object.fromEntries(Object.entries(components).map(([k, d]) => [k, Math.round(d!.value * 1000) / 1000])),
    penalties: pen.notes,
    reasons,
    matched,
    matchedSignals: matched,
    profile,
    novelty: Math.round(novelty * 1000) / 1000,
    familiarity: Math.round(familiarity * 1000) / 1000,
    semanticCosine: components.semantic?.note?.cosine as number | undefined,
  };
}
