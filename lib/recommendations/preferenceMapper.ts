import type { Book } from "@/types/book";
import type { Preferences } from "@/types/preferences";
import { AGES, AVOIDS, COMPLEXITY, ENDINGS, GENRE_LABEL, GOALS, INTENSITY, LENGTHS, MOODS, PACE } from "@/lib/discovery/options";
import { normalizeTitle } from "@/lib/api/dedupe";
import { addTags, buildProfile } from "./profile";
import { EXPERIENCE_CUES, HARD_AVOID, INTENSIFIERS, REFERENCE_PATTERNS } from "./concepts";
import { DEFAULT_PRIORITY, NEGATIVE, type Priority, type ScoreComponent } from "./config";
import {
  AVOID_TAGS,
  FICTION_GENRES,
  GENRE_TAGS,
  FICTION_CUES,
  GOAL_TAGS,
  LEXICON,
  MOOD_COUNTER_TAGS,
  MOOD_TAGS,
  NONFICTION_CUES,
  NEGATION,
  STOPWORDS,
  TAGS,
  type TagId,
  type WeightedTags,
} from "./taxonomy";
import type { HardConstraints, LikedProfile, PreferenceChip, PreferenceConflict, SessionContext, Signals, WeightedPreference } from "./types";

/* ------------------------------------------------------------------ free text */

export interface ParsedText {
  tags: WeightedTags;
  groups: WeightedTags[];
  /** +1 the reader is describing fiction, −1 non-fiction, 0 unclear. */
  lean: number;
  avoidTags: WeightedTags;
  terms: string[];
  avoidTerms: string[];
  /** Avoided tags the reader stressed ("absolutely no romance"). */
  hardAvoidTags: WeightedTags;
  /** True when the positive wishes carry an intensifier ("I really want…"). */
  intensified: boolean;
  /** Titles / names the reader compared the request to ("like Black Mirror"). */
  references: string[];
  /** Reading-experience axes the reader described directly ("fast-paced", "not too dark"). */
  experience: Partial<Record<"pace" | "complexity" | "intensity" | "darkness", number>>;
}

const LEXICON_KEYS = Object.keys(LEXICON).sort((a, b) => b.length - a.length);

/** Titles and names compared to in the request: "something like Black Mirror", "similar to The Martian". */
export function extractReferences(text: string): string[] {
  const out: string[] = [];
  for (const pattern of REFERENCE_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const ref = m[1]?.trim().replace(/[.,;!?]+$/, "");
      if (ref && ref.length >= 3 && ref.length <= 60 && !out.includes(ref)) out.push(ref);
    }
  }
  return out.slice(0, 3);
}

/**
 * Turn "something like Black Mirror but more philosophical, not too depressing"
 * into wanted tags, avoided tags, references and leftover search terms. Deterministic, no AI required.
 */
export function parseFreeText(text: string): ParsedText {
  const lower = text.toLowerCase();
  const lean = FICTION_CUES.test(lower) ? 1 : NONFICTION_CUES.test(lower) ? -1 : 0;
  const result: ParsedText = {
    tags: {},
    groups: [],
    lean,
    avoidTags: {},
    terms: [],
    avoidTerms: [],
    hardAvoidTags: {},
    intensified: false,
    references: extractReferences(text),
    experience: {},
  };
  const clauses = lower.replace(/[“”"]/g, " ").split(/[,.;!?]|\bbut\b|\bexcept\b|\bhowever\b|\bthough\b|\bwhile\b/);

  // A negation scopes over what follows it: "more philosophical and less depressing" keeps
  // "philosophical" positive and sends only "depressing" to the avoid side.
  const parts: Array<{ text: string; negated: boolean; intense: boolean }> = [];
  for (const clause of clauses) {
    const c = clause.trim();
    if (!c) continue;
    const m = NEGATION.exec(c);
    if (!m) parts.push({ text: c, negated: false, intense: INTENSIFIERS.test(c) });
    else {
      const before = c.slice(0, m.index).trim();
      const after = c.slice(m.index).trim();
      // "absolutely no romance": the stress belongs to the refusal, wherever it sits in the clause.
      if (before) parts.push({ text: before, negated: false, intense: false });
      if (after) parts.push({ text: after, negated: true, intense: INTENSIFIERS.test(c) });
    }
  }

  for (const part of parts) {
    let rest = ` ${part.text} `;
    const negated = part.negated;
    const intense = part.intense;
    const target = negated ? result.avoidTags : result.tags;
    const tagsBefore = Object.keys(target).length;

    for (const cue of EXPERIENCE_CUES) {
      if (cue.re.test(rest)) {
        // "not too dark" pushes the other way; "less depressing" likewise.
        const target = negated ? 1 - cue.target : cue.target;
        const prev = result.experience[cue.axis];
        result.experience[cue.axis] = prev === undefined ? target : (prev + target) / 2;
      }
    }

    for (const key of LEXICON_KEYS) {
      const re = new RegExp(`(?:^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}(?:$|[^a-z0-9])`);
      if (re.test(rest)) {
        addTags(target, LEXICON[key]);
        if (negated && intense) addTags(result.hardAvoidTags, LEXICON[key]);
        if (!negated) result.groups.push(LEXICON[key]);
        rest = rest.replace(re, " ");
      }
    }
    if (!negated && intense && Object.keys(target).length > tagsBefore) result.intensified = true;
    const words = rest
      .split(/[^a-z0-9'-]+/)
      .map((w) => w.replace(/^'+|'+$/g, ""))
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !NEGATION.test(w) && !INTENSIFIERS.test(w));
    for (const w of words) {
      const list = negated ? result.avoidTerms : result.terms;
      if (!list.includes(w) && list.length < 6) list.push(w);
    }
  }
  // Reference titles should not also be chased as loose keywords.
  const refWords = new Set(result.references.flatMap((r) => r.toLowerCase().split(/\s+/)));
  result.terms = result.terms.filter((t) => !refWords.has(t));
  return result;
}

/* ------------------------------------------------------------------- liked books */

const GENERIC_SUBJECT = /fiction|general|novel|literature|english|american|large type|accessible|protected|in library|reading level|open library|wishlist|overdrive|ebook|translations|award|bestseller|nyt|series/;

/** Human-readable concepts a liked book contributes: strongest tags plus its most distinctive subjects. */
export function likedConcepts(profile: LikedProfile["profile"]): string[] {
  const tags = (Object.entries(profile.tags) as Array<[TagId, number]>)
    .filter(([, v]) => v >= 0.45)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => TAGS[id].label);
  const subjects = profile.subjects.filter((s) => s.split(" ").length <= 3 && !GENERIC_SUBJECT.test(s)).slice(0, 5);
  return Array.from(new Set([...tags, ...subjects])).slice(0, 8);
}

export function toLikedProfile(book: Book, origin: LikedProfile["origin"], weight: number): LikedProfile {
  const profile = buildProfile(book);
  return { id: book.id, title: book.title, authors: book.authors, profile, concepts: likedConcepts(profile), origin, weight };
}

/**
 * Latent tastes shared across several liked books. A tag two favorites share is worth more than
 * one that appears in a single book, so Dune + Harry Potter + The Martian yields "imaginative worlds,
 * adventure, science, problem-solving" rather than the intersection of three genres.
 */
export function inferLatentTags(liked: LikedProfile[]): WeightedTags {
  if (!liked.length) return {};
  const totalWeight = liked.reduce((a, l) => a + l.weight, 0) || 1;
  const sum: Partial<Record<TagId, number>> = {};
  const count: Partial<Record<TagId, number>> = {};
  for (const l of liked) {
    for (const [tag, v] of Object.entries(l.profile.tags) as Array<[TagId, number]>) {
      if (v < 0.3) continue;
      sum[tag] = (sum[tag] ?? 0) + v * l.weight;
      count[tag] = (count[tag] ?? 0) + 1;
    }
  }
  const out: WeightedTags = {};
  for (const [tag, s] of Object.entries(sum) as Array<[TagId, number]>) {
    const mean = s / totalWeight;
    const n = count[tag] ?? 0;
    const strongest = Math.max(...liked.map((l) => l.profile.tags[tag] ?? 0));
    // Mean strength, plus credit for how many favorites carry the tag; shared tags get a boost.
    const v = Math.min(1, (0.55 * mean + 0.45 * (n / liked.length) * strongest) * (n >= 2 ? 1.2 : 1));
    if (v >= 0.2) out[tag] = Math.round(v * 1000) / 1000;
  }
  return out;
}

/**
 * Does a catalog record found for a reference ("like Black Mirror") actually fit what the reader wrote?
 * A same-titled YA crime novel must not stand in for a television series about technology.
 */
export function referenceFits(ref: Book, text: string): boolean {
  const parsed = parseFreeText(text);
  const profile = buildProfile(ref);
  const interest = (ref.readerCount ?? 0) + (ref.rating?.count ?? 0);
  if (interest < 20 && !ref.description) return false;
  const wanted = Object.entries(parsed.tags) as Array<[TagId, number]>;
  if (!wanted.length) return true;
  let miss = 1;
  for (const [tag, w] of wanted) miss *= 1 - (profile.tags[tag] ?? 0) * w;
  return 1 - miss >= 0.3;
}

/* ------------------------------------------------------------------- signals */

function chipForMood(id: (typeof MOODS)[number]["id"]): PreferenceChip {
  const m = MOODS.find((x) => x.id === id)!;
  return { kind: "mood", label: m.title, emoji: m.emoji };
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function removeGenre(genres: Signals["genres"], label: string) {
  const i = genres.findIndex((g) => g.chip.label === label);
  if (i >= 0) genres.splice(i, 1);
}

export interface SignalOptions {
  /** Books resolved from references in the free text ("like Black Mirror"). */
  references?: Book[];
  /** "More like this": the book the reader clicked. */
  focus?: Book;
  session?: SessionContext;
}

export function buildSignals(prefs: Preferences, likedBooks: Book[], opts: SignalOptions = {}): Signals {
  const moods: Signals["moods"] = prefs.moods.map((id) => ({ chip: chipForMood(id), tags: MOOD_TAGS[id], counter: MOOD_COUNTER_TAGS[id] }));

  const custom = prefs.customMood.trim() ? parseFreeText(prefs.customMood) : undefined;
  if (custom && Object.keys(custom.tags).length) {
    moods.push({ chip: { kind: "mood", label: prefs.customMood.trim().slice(0, 40), emoji: "✍️" }, tags: custom.tags });
  }

  const genres: Signals["genres"] = prefs.anyGenre
    ? []
    : prefs.genres.map((id) => ({
        chip: { kind: "genre", label: GENRE_LABEL[id] },
        tags: GENRE_TAGS[id],
        fiction: FICTION_GENRES.has(id),
      }));

  const goals: Signals["goals"] = prefs.goals.map((id) => {
    const g = GOALS.find((x) => x.id === id)!;
    return { chip: { kind: "goal", label: g.label }, tags: GOAL_TAGS[id] };
  });

  /* ---- negatives: hard vs soft ---- */
  const avoidTags: WeightedTags = {};
  const hard: HardConstraints = { excludeTags: [], excludeChildren: prefs.agePreference !== "ya", adultOnly: prefs.agePreference === "adult", excludeIds: [], excludeTitles: [], excludeTerms: [] };
  const negativeConcepts: string[] = [];
  for (const id of prefs.dislikedThemes) {
    addTags(avoidTags, AVOID_TAGS[id]);
    for (const h of HARD_AVOID[id] ?? []) hard.excludeTags.push({ tag: h.tag, threshold: h.threshold, label: AVOIDS.find((a) => a.id === id)?.label ?? id });
    negativeConcepts.push((AVOIDS.find((a) => a.id === id)?.label ?? id).toLowerCase());
  }
  const avoidTerms: string[] = [];
  if (prefs.avoidText.trim()) {
    // Everything in the "don't want" box is an avoid, negated or not.
    const parsed = parseFreeText(prefs.avoidText);
    const all: WeightedTags = {};
    addTags(all, parsed.tags);
    addTags(all, parsed.avoidTags);
    addTags(avoidTags, all);
    for (const [tag, w] of Object.entries(all) as Array<[TagId, number]>) {
      if (w >= 0.9 && TAGS[tag].kind === "genre") hard.excludeTags.push({ tag, threshold: NEGATIVE.freeTextHardThreshold, label: TAGS[tag].label });
    }
    avoidTerms.push(...parsed.terms, ...parsed.avoidTerms);
    negativeConcepts.push(...[...parsed.terms, ...parsed.avoidTerms]);
  }
  if (custom) addTags(avoidTags, custom.avoidTags);

  /* ---- free text ---- */
  let freeText: Signals["freeText"];
  let textLean = custom?.lean ?? 0;
  const experience: ParsedText["experience"] = { ...(custom?.experience ?? {}) };
  let parsedText: ParsedText | undefined;
  if (prefs.freeText.trim()) {
    parsedText = parseFreeText(prefs.freeText);
    addTags(avoidTags, parsedText.avoidTags);
    for (const [tag, w] of Object.entries(parsedText.hardAvoidTags) as Array<[TagId, number]>) {
      if (w >= 0.7 && TAGS[tag].kind === "genre") hard.excludeTags.push({ tag, threshold: NEGATIVE.freeTextHardThreshold, label: TAGS[tag].label });
    }
    avoidTerms.push(...parsedText.avoidTerms);
    negativeConcepts.push(...Object.keys(parsedText.avoidTags).map((t) => TAGS[t as TagId].label), ...parsedText.avoidTerms);
    textLean += parsedText.lean;
    Object.assign(experience, parsedText.experience);
    freeText = {
      text: prefs.freeText.trim().slice(0, 280),
      tags: parsedText.tags,
      groups: parsedText.groups,
      terms: parsedText.terms,
      intensified: parsedText.intensified,
    };
  }

  // Chips name their dimension ("Moderate complexity") so two answers never read the same.
  const scale = <T extends string>(list: Array<{ id: T; label: string; target: number }>, id: T | undefined, kind: PreferenceChip["kind"], suffix = "") => {
    const opt = id ? list.find((o) => o.id === id) : undefined;
    return opt && opt.target >= 0 ? { target: opt.target, chip: { kind, label: `${opt.label}${suffix}` } } : undefined;
  };

  const lengthOpt = LENGTHS.find((l) => l.id === prefs.readingLength);
  const age = AGES.find((a) => a.id === prefs.agePreference);

  /* ---- liked books, references, focus ---- */
  const liked: LikedProfile[] = likedBooks.map((b) => toLikedProfile(b, "liked", 1));
  for (const ref of opts.references ?? []) {
    if (!liked.some((l) => l.id === ref.id)) liked.push(toLikedProfile(ref, "reference", 0.8));
  }
  let focus: LikedProfile | undefined;
  if (opts.focus) {
    focus = toLikedProfile(opts.focus, "focus", 1.5);
    if (!liked.some((l) => l.id === focus!.id)) liked.push(focus);
  }

  const latent = inferLatentTags(liked);

  // Fiction lean: genres decide first, moods nudge.
  let lean = 0;
  for (const g of genres) lean += g.fiction ? 1 : -1;
  for (const m of prefs.moods) lean += m === "grow" || m === "learn" ? -0.6 : m === "think" ? 0 : 0.6;
  for (const l of liked) lean += l.profile.isFiction ? 0.5 : l.profile.isNonfiction ? -0.5 : 0;
  lean += textLean * 1.5;
  const fictionLean = Math.max(-1, Math.min(1, lean / 2));

  /* ---- experience axes: explicit answers, then free text, then what the liked books suggest ---- */
  let pace: Signals["pace"] = scale(PACE, prefs.pace, "experience");
  let complexity: Signals["complexity"] = scale(COMPLEXITY, prefs.complexity, "experience", " complexity");
  let intensity: Signals["intensity"] = scale(INTENSITY, prefs.emotionalIntensity, "experience", " intensity");
  let darkness: Signals["darkness"] = scale(ENDINGS, prefs.endingPreference, "experience", " ending");
  if (!pace && experience.pace !== undefined) pace = { target: experience.pace, chip: { kind: "experience", label: experience.pace >= 0.5 ? "Fast-paced" : "Slow and atmospheric" } };
  if (!complexity && experience.complexity !== undefined) complexity = { target: experience.complexity, chip: { kind: "experience", label: experience.complexity >= 0.5 ? "Challenging complexity" : "Easy and accessible" } };
  if (!intensity && experience.intensity !== undefined) intensity = { target: experience.intensity, chip: { kind: "experience", label: experience.intensity >= 0.5 ? "Emotional intensity" : "Light intensity" } };
  if (!darkness && experience.darkness !== undefined) darkness = { target: experience.darkness, chip: { kind: "experience", label: experience.darkness >= 0.5 ? "Dark" : "Hopeful" } };
  const inferredAxis = (pick: (l: LikedProfile) => { value: number; confidence: number }) => {
    const usable = liked.filter((l) => pick(l).confidence >= 0.35 && l.origin !== "reference");
    if (usable.length < 1) return undefined;
    const w = usable.reduce((a, l) => a + pick(l).confidence * l.weight, 0);
    return w ? usable.reduce((a, l) => a + pick(l).value * pick(l).confidence * l.weight, 0) / w : undefined;
  };
  if (!pace) {
    const v = inferredAxis((l) => l.profile.pace);
    if (v !== undefined && Math.abs(v - 0.5) > 0.12) pace = { target: v, chip: { kind: "experience", label: v >= 0.5 ? "Brisk, like your favorites" : "Unhurried, like your favorites" }, inferred: true };
  }
  if (!complexity) {
    const v = inferredAxis((l) => l.profile.complexity);
    if (v !== undefined && Math.abs(v - 0.45) > 0.12) complexity = { target: v, chip: { kind: "experience", label: v >= 0.45 ? "Substantial, like your favorites" : "Accessible, like your favorites" }, inferred: true };
  }

  /* ---- conflicts ---- */
  const conflicts: PreferenceConflict[] = [];
  const avoidSet = new Set(prefs.dislikedThemes);
  if (intensity && intensity.target >= 0.7 && (avoidSet.has("depressing") || avoidSet.has("sad-endings"))) {
    conflicts.push({ between: ["an emotionally intense read", "nothing too depressing"], resolution: "we leaned toward bittersweet stories that hit hard without being relentlessly bleak" });
    darkness = darkness ?? { target: 0.5, chip: { kind: "experience", label: "Bittersweet ending" } };
    if (darkness.target > 0.6) darkness = { ...darkness, target: 0.5 };
  }
  if (prefs.moods.includes("cozy") && (prefs.moods.includes("uncomfortable") || prefs.genres.includes("horror"))) {
    conflicts.push({ between: ["something cozy", "something unsettling"], resolution: "we favored atmospheric, gothic-leaning books over outright horror" });
  }
  if (avoidSet.has("romance") && prefs.genres.includes("romance")) {
    conflicts.push({ between: ["the romance genre", "avoiding romance"], resolution: "your avoid list wins, so romance stays out" });
    removeGenre(genres, GENRE_LABEL.romance);
  }
  if (avoidSet.has("self-help") && (prefs.moods.includes("grow") || prefs.genres.includes("self-help"))) {
    conflicts.push({ between: ["help me grow", "no self-help"], resolution: "we looked for psychology, philosophy and biographies instead of advice books" });
    for (const m of moods) if (m.chip.label === "Help me grow") m.tags = { psychology: 0.9, philosophy: 0.7, biography: 0.6, spirituality: 0.4 };
  }
  if (avoidSet.has("too-slow") && pace && pace.target <= 0.3 && !pace.inferred) {
    conflicts.push({ between: ["slow and atmospheric", "not too slow"], resolution: "we aimed for measured books that still move"});
    pace = { ...pace, target: 0.45 };
  }
  if ((avoidSet.has("complicated") || avoidSet.has("dense-philosophy")) && complexity && complexity.target >= 0.7 && !complexity.inferred) {
    conflicts.push({ between: ["a challenging read", "nothing too complicated"], resolution: "we favored books with big ideas and clear prose" });
    complexity = { ...complexity, target: 0.55 };
  }
  if (avoidSet.has("horror") && (prefs.moods.includes("uncomfortable") || prefs.genres.includes("horror"))) {
    conflicts.push({ between: ["being made uncomfortable", "no horror"], resolution: "we leaned on psychological and literary darkness rather than horror" });
    removeGenre(genres, GENRE_LABEL.horror);
    for (const m of moods) if (m.chip.label === "Make me uncomfortable") m.tags = { dark: 1, mentalhealth: 0.6, dystopian: 0.5, crime: 0.4, literary: 0.4, gothic: 0.3 };
  }

  /* ---- hard constraints from answers ---- */
  if (lengthOpt && lengthOpt.id !== "any") hard.maxPages = Math.round(lengthOpt.max * NEGATIVE.hardLengthFactor + NEGATIVE.hardLengthSlack);
  if (prefs.dislikedThemes.includes("long")) hard.maxPages = Math.min(hard.maxPages ?? Infinity, 520);
  if (hard.maxPages === Infinity) delete hard.maxPages;
  hard.excludeIds = Array.from(new Set([...liked.map((l) => l.id), ...(opts.session?.rejected.map((r) => r.bookId) ?? []), ...(opts.session?.seen ?? [])]));
  hard.excludeTitles = liked.map((l) => normalizeTitle(l.title)).filter((t) => t.length >= 3);

  /* ---- derived positive profile ---- */
  const themes: WeightedTags = {};
  for (const [tag, v] of Object.entries(latent) as Array<[TagId, number]>) if (TAGS[tag].kind === "theme") themes[tag] = v * 0.9;
  if (freeText) for (const [tag, v] of Object.entries(freeText.tags) as Array<[TagId, number]>) if (TAGS[tag].kind === "theme") themes[tag] = Math.max(themes[tag] ?? 0, v);
  for (const tag of Object.keys(avoidTags) as TagId[]) delete themes[tag];

  const positiveTags: WeightedTags = {};
  for (const m of moods) addTags(positiveTags, m.tags);
  for (const g of genres) addTags(positiveTags, g.tags);
  for (const g of goals) addTags(positiveTags, g.tags, 0.8);
  if (freeText) addTags(positiveTags, freeText.tags);
  addTags(positiveTags, latent, 0.9);
  for (const tag of Object.keys(avoidTags) as TagId[]) if ((avoidTags[tag] ?? 0) >= 0.5) delete positiveTags[tag];

  const pref = (tag: TagId, weight: number, priority: Exclude<Priority, "hard">, source: string): WeightedPreference => ({ tag, label: TAGS[tag].label, weight, priority, source });
  const preferredGenres: WeightedPreference[] = [];
  const preferredThemes: WeightedPreference[] = [];
  const seenPref = new Set<string>();
  const pushPref = (p: WeightedPreference) => {
    const key = `${p.tag}`;
    if (seenPref.has(key)) return;
    seenPref.add(key);
    (TAGS[p.tag].kind === "genre" ? preferredGenres : preferredThemes).push(p);
  };
  for (const g of genres) for (const [tag, w] of Object.entries(g.tags) as Array<[TagId, number]>) if (w >= 0.9) pushPref(pref(tag, w, genres.length === 1 ? "veryImportant" : "important", "genre"));
  for (const l of liked) for (const [tag, w] of Object.entries(latent) as Array<[TagId, number]>) if (w >= 0.45 && (l.profile.tags[tag] ?? 0) >= 0.45) pushPref(pref(tag, w, "important", "liked"));
  for (const m of moods) for (const [tag, w] of Object.entries(m.tags) as Array<[TagId, number]>) if (w >= 0.6) pushPref(pref(tag, w, "important", "mood"));
  if (freeText) for (const [tag, w] of Object.entries(freeText.tags) as Array<[TagId, number]>) if (w >= 0.6) pushPref(pref(tag, w, freeText.intensified ? "veryImportant" : "important", "freeText"));
  for (const g of goals) for (const [tag, w] of Object.entries(g.tags) as Array<[TagId, number]>) if (w >= 0.8) pushPref(pref(tag, w, "preference", "goal"));

  const positiveConcepts = Array.from(
    new Set([
      ...preferredGenres.map((p) => p.label),
      ...preferredThemes.map((p) => p.label),
      ...liked.flatMap((l) => l.concepts.slice(0, 3)),
    ]),
  ).slice(0, 16);

  /* ---- priorities ---- */
  const priorities: Signals["priorities"] = { ...DEFAULT_PRIORITY };
  if (genres.length === 1) priorities.genreMatch = "veryImportant";
  if (genres.length >= 4) priorities.genreMatch = "preference";
  if (freeText?.intensified) priorities.freeTextMatch = "veryImportant";
  if (pace && !pace.inferred && (prefs.pace === "addictive" || prefs.pace === "slow")) priorities.paceMatch = "important";
  if (pace?.inferred) priorities.paceMatch = "weak";
  if (complexity?.inferred) priorities.complexityMatch = "weak";
  if (complexity && !complexity.inferred && (prefs.complexity === "very-challenging" || prefs.complexity === "easy")) priorities.complexityMatch = "important";
  if (intensity && prefs.emotionalIntensity === "devastating") priorities.toneMatch = "important";
  if (lengthOpt && (lengthOpt.id === "quick" || lengthOpt.id === "huge")) priorities.lengthMatch = "important";
  if (liked.length === 0) delete priorities.likedBookSimilarity;
  if (focus) priorities.likedBookSimilarity = "veryImportant";

  /* ---- semantic profile text (positives only; embedding models handle negation poorly) ---- */
  const semanticProfileText = buildSemanticProfileText({ moods: prefs.moods, genres, goals: prefs.goals, pace, complexity, intensity, darkness, liked, freeText: parsedText, focus });

  /* ---- completeness ---- */
  const answered =
    (moods.length ? 1 : 0) * 1 +
    (genres.length ? 1 : 0) * 1 +
    (liked.some((l) => l.origin !== "reference") ? 1 : 0) * 1.6 +
    (freeText ? (Object.keys(freeText.tags).length >= 3 || liked.some((l) => l.origin === "reference") ? 2 : 1.2) : 0) +
    (goals.length ? 1 : 0) * 0.6 +
    (pace && !pace.inferred ? 1 : 0) * 0.5 +
    (complexity && !complexity.inferred ? 1 : 0) * 0.4 +
    (intensity ? 1 : 0) * 0.4 +
    (lengthOpt && lengthOpt.id !== "any" ? 1 : 0) * 0.3 +
    (prefs.dislikedThemes.length || prefs.avoidText.trim() ? 1 : 0) * 0.5;
  const completeness = clamp(answered / 5.2);

  return {
    moods,
    genres,
    goals,
    freeText,
    avoidTags,
    avoidTerms: Array.from(new Set(avoidTerms)).slice(0, 8),
    avoidSlow: prefs.dislikedThemes.includes("too-slow"),
    avoidComplex: prefs.dislikedThemes.includes("complicated") || prefs.dislikedThemes.includes("dense-philosophy"),
    avoidLong: prefs.dislikedThemes.includes("long"),
    pace,
    complexity,
    intensity,
    darkness,
    length:
      lengthOpt && lengthOpt.id !== "any"
        ? { min: lengthOpt.min, max: lengthOpt.max, chip: { kind: "length", label: `${lengthOpt.title} (${lengthOpt.detail.toLowerCase()})` } }
        : undefined,
    age: age && age.id !== "any" ? age.id : undefined,
    liked,
    likedAuthors: Array.from(new Set(liked.filter((l) => l.origin !== "reference").flatMap((l) => l.authors.map((a) => a.toLowerCase())))),
    fictionLean,
    qualityMode: "balanced",
    latent,
    themes,
    positiveTags,
    preferredGenres,
    preferredThemes,
    positiveConcepts,
    negativeConcepts: Array.from(new Set(negativeConcepts)).slice(0, 12),
    semanticProfileText,
    hard,
    priorities,
    conflicts,
    completeness,
    focus,
  };
}

interface ProfileTextInput {
  moods: Preferences["moods"];
  genres: Signals["genres"];
  goals: Preferences["goals"];
  pace?: Signals["pace"];
  complexity?: Signals["complexity"];
  intensity?: Signals["intensity"];
  darkness?: Signals["darkness"];
  liked: LikedProfile[];
  freeText?: ParsedText;
  focus?: LikedProfile;
}

const MOOD_TEXT: Record<Preferences["moods"][number], string> = {
  think: "thought-provoking books full of ideas, philosophy, psychology and social commentary",
  escape: "immersive escapism: other worlds, magic, far futures, long journeys",
  emotional: "emotional, character-driven stories about love, grief and becoming",
  hooked: "gripping, suspenseful page-turners",
  uncomfortable: "unsettling, disturbing, psychologically dark fiction",
  grow: "self-development, psychology and better ways to live and work",
  cozy: "cozy comfort reads: warmth, small communities, friendship, gentle humor",
  learn: "learning something real: history, science, economics, technology, lives well told",
};

const GOAL_TEXT: Record<Preferences["goals"][number], string> = {
  perspective: "a new perspective",
  knowledge: "knowledge",
  motivation: "motivation",
  emotional: "an emotional experience",
  entertainment: "pure entertainment",
  inspiration: "inspiration",
  people: "understanding people better",
  myself: "understanding themselves better",
  talk: "something to talk about",
  escape: "an escape from everyday life",
  "new-world": "a completely new world",
};

/** Natural-language reader profile for the embedding model. */
export function buildSemanticProfileText(i: ProfileTextInput): string {
  const parts: string[] = [];
  if (i.focus) parts.push(`books very similar to ${i.focus.title}${i.focus.concepts.length ? ` (${i.focus.concepts.slice(0, 6).join(", ")})` : ""}`);
  if (i.moods.length) parts.push(i.moods.map((m) => MOOD_TEXT[m]).join("; "));
  if (i.genres.length) parts.push(`genres: ${i.genres.map((g) => g.chip.label.toLowerCase()).join(", ")}`);
  const exp: string[] = [];
  if (i.pace) exp.push(i.pace.target >= 0.7 ? "fast-paced" : i.pace.target <= 0.3 ? "slow, atmospheric" : "steadily paced");
  if (i.complexity) exp.push(i.complexity.target >= 0.7 ? "intellectually demanding" : i.complexity.target <= 0.3 ? "easy to read" : "moderately challenging");
  if (i.intensity) exp.push(i.intensity.target >= 0.7 ? "emotionally intense" : i.intensity.target <= 0.25 ? "light-hearted" : "moderately emotional");
  if (i.darkness) exp.push(i.darkness.target >= 0.7 ? "dark" : i.darkness.target <= 0.35 ? "hopeful" : "bittersweet");
  if (exp.length) parts.push(exp.join(", "));
  for (const l of i.liked) {
    if (l.origin === "focus") continue;
    parts.push(`${l.origin === "reference" ? "in the spirit of" : "similar to"} ${l.title}${l.concepts.length ? ` (${l.concepts.slice(0, 5).join(", ")})` : ""}`);
  }
  if (i.goals.length) parts.push(`hoping to come away with ${i.goals.map((g) => GOAL_TEXT[g]).join(", ")}`);
  if (i.freeText) {
    const positives = Object.keys(i.freeText.tags).map((t) => TAGS[t as TagId].label);
    const bits = [...positives, ...i.freeText.terms];
    if (bits.length) parts.push(`in their words: ${bits.join(", ")}`);
  }
  return parts.length ? `Reader wants: ${parts.join(". ")}.` : "";
}

/** Chips summarizing what the reader asked for, shown at the top of results. */
export function signalChips(s: Signals): PreferenceChip[] {
  const chips: PreferenceChip[] = [
    ...s.moods.map((m) => m.chip),
    ...s.genres.map((g) => g.chip),
    ...[s.pace, s.complexity, s.intensity, s.darkness].flatMap((x) => (x && !x.inferred ? [x.chip] : [])),
    ...(s.length ? [s.length.chip] : []),
    ...s.goals.map((g) => g.chip),
    ...s.liked.filter((l) => l.origin === "liked").map((l) => ({ kind: "liked" as const, label: `Loved ${l.title}` })),
    ...s.liked.filter((l) => l.origin === "reference").map((l) => ({ kind: "freeText" as const, label: `Like ${l.title}` })),
  ];
  return chips.slice(0, 14);
}

export function avoidLabels(prefs: Preferences): string[] {
  return prefs.dislikedThemes.map((id) => AVOIDS.find((a) => a.id === id)?.label ?? id);
}

/** Priority multiplier lookup for a component. */
export function priorityOf(s: Signals, component: ScoreComponent): Exclude<Priority, "hard"> {
  return s.priorities[component] ?? DEFAULT_PRIORITY[component];
}
