import type { Book } from "@/types/book";
import { normalizeSubjects, TAG_IDS, TAG_REGEX, TAGS, type TagId, type WeightedTags } from "./taxonomy";
import type { BookProfile } from "./types";

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

const FICTION_HINT = /\b(fiction|novels?|stories|romance|fantasy|thrillers?)\b/;
const NONFICTION_HINT =
  /\b(nonfiction|non-fiction|popular works|biograph\w*|autobiograph\w*|memoirs?|personal narratives|self-help|essays|handbooks|guides?|history and criticism|textbooks?|study and teaching|research|case studies)\b/;

function weighted(tags: WeightedTags, table: Partial<Record<TagId, number>>): number {
  let sum = 0;
  for (const [tag, w] of Object.entries(table) as Array<[TagId, number]>) sum += (tags[tag] ?? 0) * w;
  return sum;
}

/** Merge weighted tag sets, keeping the strongest weight per tag. */
export function addTags(into: WeightedTags, from: WeightedTags, scale = 1) {
  for (const [k, v] of Object.entries(from) as Array<[TagId, number]>) {
    into[k] = Math.max(into[k] ?? 0, v * scale);
  }
}

/**
 * Infer tags and reading-experience estimates from catalog metadata.
 * Subjects are strong evidence, descriptions weaker, titles weakest.
 */
export function buildProfile(book: Book): BookProfile {
  const subjects = normalizeSubjects([...book.subjects, ...book.categories], 80);
  const rawLower = [...book.subjects, ...book.categories].map((s) => s.toLowerCase());
  const description = (book.description ?? "").toLowerCase();
  const title = `${book.title} ${book.subtitle ?? ""}`.toLowerCase();

  // Catalog subjects are crowd-edited and sometimes contradict each other, so fiction vs non-fiction is a majority vote.
  const ficVotes = rawLower.filter((s) => FICTION_HINT.test(s) && !NONFICTION_HINT.test(s)).length;
  const nonVotes = rawLower.filter((s) => NONFICTION_HINT.test(s)).length;
  const isFiction = ficVotes > 0 && ficVotes >= nonVotes * 1.5;
  const isNonfiction = !isFiction && (nonVotes > 0 || subjects.length > 0);

  const tags: WeightedTags = {};
  const evidence: BookProfile["evidence"] = {};
  for (const id of TAG_IDS) {
    const re = TAG_REGEX[id];
    let hits = 0;
    const found: string[] = [];
    for (const s of subjects) {
      if (re.test(s)) {
        hits += 1;
        if (found.length < 3) found.push(s);
      }
    }
    // Raw headings catch compound phrases lost when splitting (e.g. "Fiction, science fiction, general").
    if (hits === 0 && rawLower.some((s) => re.test(s))) hits += 0.8;
    if (description && re.test(description)) hits += 0.45;
    if (re.test(title)) hits += 0.3;
    if (hits === 0) continue;
    let strength = 1 - Math.exp(-1.4 * hits);
    if (TAGS[id].nonfiction && isFiction) strength *= 0.45;
    if (TAGS[id].fiction && isNonfiction && nonVotes > 0) strength *= 0.35;
    tags[id] = Math.round(strength * 1000) / 1000;
    if (found.length) evidence[id] = found;
  }

  const fast = weighted(tags, { thriller: 1, mystery: 0.8, crime: 0.7, adventure: 0.6, horror: 0.5, ya: 0.4, survival: 0.4, romance: 0.25 });
  const slow = weighted(tags, { literary: 0.8, classics: 0.6, philosophy: 0.7, historical: 0.35, nature: 0.4, gothic: 0.3, history: 0.35, biography: 0.25, spirituality: 0.4 });
  const pace = { value: clamp(0.5 + 0.42 * Math.tanh(1.6 * (fast - slow))), confidence: clamp((fast + slow) / 1.1) };

  let hard = weighted(tags, { philosophy: 0.8, classics: 0.6, literary: 0.6, economics: 0.5, science: 0.4, history: 0.3, politics: 0.3 });
  const easy = weighted(tags, { ya: 0.8, children: 1, cozy: 0.5, romance: 0.4, humor: 0.4, selfhelp: 0.3, thriller: 0.3, adventure: 0.2 });
  if (book.publishedYear && book.publishedYear < 1920) hard += 0.4;
  if (book.pageCount && book.pageCount > 650) hard += 0.15;
  const complexity = { value: clamp(0.45 + 0.42 * Math.tanh(1.5 * (hard - easy))), confidence: clamp((hard + easy) / 1.1) };

  const intense = weighted(tags, { grief: 0.9, dark: 0.8, war: 0.7, horror: 0.7, violence: 0.6, emotional: 0.6, mentalhealth: 0.5 });
  const light = weighted(tags, { cozy: 0.9, humor: 0.8, children: 0.5, adventure: 0.2, romance: 0.2 });
  const intensity = { value: clamp(0.45 + 0.45 * Math.tanh(1.5 * (intense - light))), confidence: clamp((intense + light) / 1.1) };

  const darkSide = weighted(tags, { dark: 1, horror: 0.8, dystopian: 0.7, war: 0.5, grief: 0.6, violence: 0.5, gothic: 0.5 });
  const brightSide = weighted(tags, { cozy: 1, humor: 0.9, romance: 0.5, friendship: 0.5, children: 0.4 });
  const darkness = { value: clamp(0.42 + 0.48 * Math.tanh(1.5 * (darkSide - brightSide))), confidence: clamp((darkSide + brightSide) / 1.1) };

  return {
    tags,
    evidence,
    subjects: subjects.slice(0, 40),
    isFiction,
    isNonfiction,
    pace,
    complexity,
    intensity,
    darkness,
    thin: subjects.length < 4 && !book.description,
  };
}

/**
 * How firmly a tag is attached to a book, on the evidence rather than the raw strength:
 * 1.0 = two or more catalog subjects (or the book's dominant genre), 0.55 = one subject,
 * 0.45 = a compound heading, 0.2 = description or title only. One stray heading never counts as "strongly".
 */
export function tagAssociation(profile: BookProfile, tag: TagId): number {
  const strength = profile.tags[tag] ?? 0;
  if (!strength) return 0;
  const hits = profile.evidence[tag]?.length ?? 0;
  if (hits >= 2) return 1;
  if (hits === 1) {
    const topGenre = (Object.entries(profile.tags) as Array<[TagId, number]>).filter(([id]) => TAGS[id].kind === "genre").sort((a, b) => b[1] - a[1])[0]?.[0];
    return topGenre === tag ? 0.9 : 0.55;
  }
  return strength >= 0.6 ? 0.45 : 0.2;
}

/** Cosine similarity between two tag vectors. */
export function tagCosine(a: WeightedTags, b: WeightedTags): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const id of TAG_IDS) {
    const x = a[id] ?? 0;
    const y = b[id] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Set-cosine overlap of normalized subject phrases. */
export function subjectOverlap(a: string[], b: string[]): { score: number; shared: string[] } {
  if (!a.length || !b.length) return { score: 0, shared: [] };
  const setB = new Set(b);
  const shared = a.filter((s) => setB.has(s));
  return { score: shared.length / Math.sqrt(a.length * b.length), shared };
}

/** Cosine between two unit-normalized embedding vectors (falls back to a full cosine when not normalized). */
export function vectorCosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * How alike two candidate books are, for diversity reranking. Tags describe the flavor,
 * subjects the specifics, embeddings (when present) the overall gist.
 */
export function bookSimilarity(a: { profile: BookProfile; embedding?: number[] }, b: { profile: BookProfile; embedding?: number[] }): number {
  const tags = tagCosine(a.profile.tags, b.profile.tags);
  const subj = Math.min(1, subjectOverlap(a.profile.subjects, b.profile.subjects).score * 2.5);
  if (a.embedding && b.embedding) {
    const sem = clamp((vectorCosine(a.embedding, b.embedding) - 0.2) / 0.7);
    return clamp(0.45 * tags + 0.25 * subj + 0.3 * sem);
  }
  return clamp(0.65 * tags + 0.35 * subj);
}
