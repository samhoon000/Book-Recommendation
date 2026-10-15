import type { Book } from "@/types/book";
import { GOALS, LENGTHS, MOODS } from "@/lib/discovery/options";
import { CONCEPT_PHRASE } from "./concepts";
import { PRIORITY_MULTIPLIER, SCORE_WEIGHTS, type ScoreComponent } from "./config";
import { TAGS, type TagId } from "./taxonomy";
import type { BookProfile, MatchReason, PreferenceChip, RecommendationExplanation, ScoredBook, Signals } from "./types";
import type { ComponentMap, LikedMatch } from "./scoring";

/**
 * Deterministic explanations. Every sentence is built from a signal that actually contributed
 * to the score, and phrased as catalog evidence rather than a claim about the book's content.
 */

const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

const quoteList = (items: string[]) => list(items.map((s) => `“${s}”`));

function evidenceFor(profile: BookProfile, tag: TagId | undefined): string {
  if (!tag) return "";
  const label = TAGS[tag].label;
  const ev = (profile.evidence[tag] ?? []).filter((e) => !e.includes(label));
  const direct = profile.evidence[tag]?.includes(label);
  if (direct && ev.length) return `It's catalogued as ${label}, with subjects like ${quoteList(ev.slice(0, 2))}.`;
  if (direct) return `It's catalogued as ${label}.`;
  if (ev.length) return `Open Library files it under ${quoteList(ev.slice(0, 2))}, which usually signals ${label}.`;
  return `Its description touches on ${label}.`;
}

interface PerMatch {
  chip: PreferenceChip;
  score: number;
  best?: TagId;
}

function strengthOf(component: ScoreComponent, value: number, s: Signals): number {
  const p = s.priorities[component] ?? "important";
  return value * SCORE_WEIGHTS[component] * PRIORITY_MULTIPLIER[p];
}

export function explain(book: Book, profile: BookProfile, c: ComponentMap, s: Signals, focusSim?: number): { reasons: MatchReason[]; matched: PreferenceChip[] } {
  const reasons: MatchReason[] = [];
  const matched: PreferenceChip[] = [];
  const add = (r: MatchReason) => reasons.push(r);

  if (s.focus && focusSim !== undefined && focusSim >= 0.3) {
    const f = s.focus;
    const sharedTags = (Object.keys(f.profile.tags) as TagId[])
      .filter((t) => (profile.tags[t] ?? 0) > 0.45 && (f.profile.tags[t] ?? 0) > 0.45)
      .sort((a, b) => (profile.tags[b] ?? 0) - (profile.tags[a] ?? 0))
      .slice(0, 3)
      .map((t) => TAGS[t].label);
    const shared = profile.subjects.filter((x) => f.profile.subjects.includes(x)).slice(0, 2);
    let detail = sharedTags.length ? `Both lean into ${list(sharedTags)}.` : "Its overall subject profile sits close to it.";
    if (shared.length) detail += ` They share catalog subjects like ${quoteList(shared)}.`;
    matched.push({ kind: "liked", label: `Like ${f.title}` });
    add({ kind: "liked", heading: `You asked for more like ${f.title}`, detail, strength: focusSim * 0.4 });
  }

  const moodPer = (c.moodMatch?.note?.per as PerMatch[] | undefined) ?? [];
  for (const m of [...moodPer].sort((a, b) => b.score - a.score)) {
    if (m.score < 0.35) continue;
    matched.push(m.chip);
    const option = MOODS.find((o) => o.title === m.chip.label);
    add({
      kind: "mood",
      heading: option ? `You wanted ${option.phrase}` : `You described your mood as “${m.chip.label}”`,
      detail: evidenceFor(profile, m.best),
      strength: strengthOf("moodMatch", m.score, s),
    });
  }

  const genrePer = (c.genreMatch?.note?.per as PerMatch[] | undefined) ?? [];
  for (const g of [...genrePer].sort((a, b) => b.score - a.score).slice(0, 2)) {
    if (g.score < 0.45) continue;
    matched.push(g.chip);
    add({ kind: "genre", heading: `You picked ${g.chip.label}`, detail: evidenceFor(profile, g.best), strength: strengthOf("genreMatch", g.score, s) });
  }

  const likedPer = (c.likedBookSimilarity?.note?.per as LikedMatch[] | undefined) ?? [];
  for (const l of [...likedPer].sort((a, b) => b.sim - a.sim).slice(0, 2)) {
    if (l.sim < 0.35) continue;
    matched.push(l.origin === "reference" ? { kind: "freeText", label: `Like ${l.title}` } : { kind: "liked", label: `Loved ${l.title}` });
    const tagText = l.sharedTags.map((t) => TAGS[t].label);
    const sameAuthor = s.liked.find((x) => x.id === l.id)?.authors.some((a) => book.authors.includes(a));
    let detail: string;
    if (tagText.length && l.shared.length) detail = `Both lean into ${list(tagText)}, and they share catalog subjects like ${quoteList(l.shared.slice(0, 2))}.`;
    else if (tagText.length) detail = `Both lean into ${list(tagText)}.`;
    else if (l.shared.length) detail = `They share catalog subjects like ${quoteList(l.shared.slice(0, 2))}.`;
    else if (l.semanticSim !== undefined && l.semanticSim >= 0.5) detail = "Their descriptions read alike: similar concerns, similar kind of story.";
    else detail = "Its overall subject profile sits close to it.";
    if (sameAuthor) detail += " It's by the same author, so expect a familiar voice.";
    add({
      kind: "liked",
      heading: l.origin === "reference" ? `You mentioned ${l.title}` : `You liked ${l.title}`,
      detail,
      // The most personal reason leads the explanation whenever the connection is real.
      strength: strengthOf("likedBookSimilarity", l.sim, s) * (l.sim >= 0.5 ? 1.6 : 1),
    });
  }

  if (c.themeMatch && c.themeMatch.value >= 0.45) {
    const best = c.themeMatch.note?.best as TagId | undefined;
    const fromLiked = s.liked.filter((l) => best && (l.profile.tags[best] ?? 0) >= 0.45).map((l) => l.title);
    if (best) {
      add({
        kind: "theme",
        heading: fromLiked.length ? `Your favorites share ${TAGS[best].label}` : `You're drawn to ${TAGS[best].label}`,
        detail: `${evidenceFor(profile, best)}${fromLiked.length ? ` That thread runs through ${list(fromLiked.slice(0, 2))} too.` : ""}`,
        strength: strengthOf("themeMatch", c.themeMatch.value, s),
      });
    }
  }

  const goalPer = (c.goalMatch?.note?.per as PerMatch[] | undefined) ?? [];
  for (const g of [...goalPer].sort((a, b) => b.score - a.score).slice(0, 2)) {
    if (g.score < 0.4) continue;
    matched.push(g.chip);
    const option = GOALS.find((o) => o.label === g.chip.label);
    add({
      kind: "goal",
      heading: `You want to come away with ${option?.phrase ?? g.chip.label.toLowerCase()}`,
      detail: g.best ? `Its focus on ${TAGS[g.best].label} fits that, judging by its subjects.` : "Its subjects fit that goal.",
      strength: strengthOf("goalMatch", g.score, s),
    });
  }

  if (c.freeTextMatch && c.freeTextMatch.value >= 0.4 && s.freeText) {
    const hits = (c.freeTextMatch.note?.hits as string[] | undefined) ?? [];
    const tagHits = (Object.keys(s.freeText.tags) as TagId[])
      .filter((t) => (profile.tags[t] ?? 0) > 0.4)
      .sort((a, b) => (profile.tags[b] ?? 0) - (profile.tags[a] ?? 0))
      .slice(0, 3)
      .map((t) => TAGS[t].label);
    const bits = [...tagHits, ...hits].slice(0, 4);
    matched.push({ kind: "freeText", label: "Your description" });
    const text = s.freeText.text.length > 70 ? `${s.freeText.text.slice(0, 68).trim()}…` : s.freeText.text;
    add({
      kind: "freeText",
      heading: `You described “${text}”`,
      detail: bits.length ? `It touches on ${list(bits)}.` : "Its subjects overlap with what you described.",
      strength: strengthOf("freeTextMatch", c.freeTextMatch.value, s),
    });
  }

  if (c.semantic && c.semantic.value >= 0.55) {
    const concepts = s.positiveConcepts.slice(0, 3);
    add({
      kind: "semantic",
      heading: "Its description reads like what you asked for",
      detail: concepts.length ? `Judged on the whole description rather than tags, it sits close to ${list(concepts)}.` : "Judged on the whole description rather than tags, it sits close to your request.",
      strength: strengthOf("semantic", c.semantic.value, s) * 0.8,
    });
  }

  if (c.paceMatch && s.pace && c.paceMatch.value >= 0.65 && profile.pace.confidence > 0.3) {
    if (!s.pace.inferred) matched.push(s.pace.chip);
    const fast = profile.pace.value >= 0.55;
    const tag = (fast ? (["thriller", "mystery", "crime", "adventure"] as TagId[]) : (["literary", "classics", "gothic"] as TagId[])).find((t) => (profile.tags[t] ?? 0) > 0.4);
    add({
      kind: "pace",
      heading: s.pace.inferred ? `Your favorites move ${fast ? "briskly" : "slowly"}, and so does this` : `You wanted ${s.pace.chip.label.toLowerCase()} reading`,
      detail: tag
        ? `It's catalogued as ${TAGS[tag].label}, which usually means ${fast ? "strong narrative drive" : "a story that takes its time"}.`
        : `Its catalog profile suggests ${fast ? "a quick-moving read" : "an unhurried read"}.`,
      strength: strengthOf("paceMatch", c.paceMatch.value, s),
    });
  }

  if (c.lengthMatch && s.length && c.lengthMatch.note?.known && c.lengthMatch.value >= 0.95 && book.pageCount) {
    matched.push(s.length.chip);
    const phrase = LENGTHS.find((l) => l.min === s.length!.min && l.max === s.length!.max)?.phrase ?? "this length";
    add({
      kind: "length",
      heading: `You wanted ${phrase}`,
      detail: `Typical editions run about ${book.pageCount} pages.`,
      strength: strengthOf("lengthMatch", c.lengthMatch.value, s),
    });
  }

  if (c.complexityMatch && s.complexity && !s.complexity.inferred && c.complexityMatch.value >= 0.7 && profile.complexity.confidence > 0.3) {
    matched.push(s.complexity.chip);
    add({
      kind: "complexity",
      heading: `You asked for ${s.complexity.chip.label.toLowerCase()}`,
      detail: "Its genre and subjects suggest that level of challenge. Treat this as a hint rather than a guarantee.",
      strength: strengthOf("complexityMatch", c.complexityMatch.value, s),
    });
  }

  if (c.toneMatch && c.toneMatch.value >= 0.7 && (s.intensity || s.darkness)) {
    const chip = (s.darkness ?? s.intensity)!.chip;
    matched.push(chip);
    add({
      kind: "tone",
      heading: s.darkness ? `You hoped for a ${chip.label.toLowerCase()}` : `You wanted ${chip.label.toLowerCase()}`,
      detail: `Its subjects suggest a ${profile.darkness.value > 0.55 ? "darker" : "lighter"} tone. Catalogs don't describe endings, so this is a soft signal.`,
      strength: strengthOf("toneMatch", c.toneMatch.value, s),
    });
  }

  const r = book.rating;
  if (r && r.count >= 15 && r.average >= 3.8) {
    add({
      kind: "quality",
      heading: "Readers rate it well",
      detail: `${r.average.toFixed(1)} average from ${r.count.toLocaleString("en-US")} ratings on Open Library.`,
      strength: 0.012 + (r.average - 3.8) * 0.02,
    });
  } else if ((book.readerCount ?? 0) >= 400) {
    add({
      kind: "quality",
      heading: "Widely read",
      detail: `${(book.readerCount ?? 0).toLocaleString("en-US")} readers have it on their Open Library shelves.`,
      strength: 0.01,
    });
  }

  if (profile.thin && reasons.length < 2) {
    add({
      kind: "quality",
      heading: "A looser match",
      detail: "The catalog has little information about this book, so this pick rests on fewer signals than the others.",
      strength: 0.001,
    });
  }

  reasons.sort((a, b) => b.strength - a.strength);
  const seen = new Set<string>();
  const uniqueMatched = matched.filter((m) => (seen.has(`${m.kind}:${m.label}`) ? false : (seen.add(`${m.kind}:${m.label}`), true)));
  return { reasons: reasons.slice(0, 6), matched: uniqueMatched };
}

/* ------------------------------------------------------------------ tradeoffs */

/** Honest differences: expressed preferences this book does not meet well. Built from the same component scores. */
export function tradeoffs(sb: ScoredBook, s: Signals): string[] {
  const out: Array<{ text: string; severity: number }> = [];
  const c = sb.components;
  const p = sb.profile;
  const push = (text: string, severity: number) => out.push({ text, severity });

  if (s.pace && !s.pace.inferred && c.paceMatch !== undefined && c.paceMatch < 0.45 && p.pace.confidence > 0.3) {
    const slower = p.pace.value < s.pace.target;
    push(slower ? `It's slower-paced than you asked for.` : `It moves faster than the unhurried read you asked for.`, 1 - c.paceMatch);
  }
  if (s.complexity && !s.complexity.inferred && c.complexityMatch !== undefined && c.complexityMatch < 0.45 && p.complexity.confidence > 0.3) {
    const harder = p.complexity.value > s.complexity.target;
    push(harder ? `It's more demanding than the ${s.complexity.chip.label.toLowerCase()} you asked for.` : `It's an easier read than you asked for.`, 1 - c.complexityMatch);
  }
  if (s.length && c.lengthMatch !== undefined && c.lengthMatch < 0.6 && sb.book.pageCount) {
    push(sb.book.pageCount > s.length.max ? `Longer than you wanted, at about ${sb.book.pageCount} pages.` : `Shorter than you wanted, at about ${sb.book.pageCount} pages.`, 1 - c.lengthMatch);
  }
  if ((s.intensity || s.darkness) && c.toneMatch !== undefined && c.toneMatch < 0.45) {
    const target = s.darkness?.target ?? s.intensity?.target ?? 0.5;
    const darker = p.darkness.value > target;
    push(darker ? `Its subjects suggest a darker tone than you hoped for.` : `It's lighter in tone than you asked for.`, 1 - c.toneMatch);
  }
  if (s.genres.length && c.genreMatch !== undefined && c.genreMatch < 0.35) {
    const primary = (Object.entries(p.tags) as Array<[TagId, number]>).filter(([id]) => TAGS[id].kind === "genre").sort((a, b) => b[1] - a[1])[0];
    push(primary ? `Not quite ${s.genres.map((g) => g.chip.label).slice(0, 2).join(" or ")}: it's catalogued mainly as ${TAGS[primary[0]].label}.` : `It sits outside the genres you picked.`, 1 - c.genreMatch);
  }
  if (s.liked.length && c.likedBookSimilarity !== undefined && c.likedBookSimilarity < 0.3) {
    const titles = s.liked.filter((l) => l.origin === "liked").map((l) => l.title).slice(0, 2);
    if (titles.length) push(`Only loosely connected to ${list(titles)}.`, 1 - c.likedBookSimilarity);
  }
  if (s.moods.length && c.moodMatch !== undefined && c.moodMatch < 0.3) {
    push(`A weaker fit for the mood you chose (${s.moods[0].chip.label.toLowerCase()}).`, 1 - c.moodMatch);
  }
  for (const note of sb.penalties.slice(0, 2)) {
    if (/avoid|catalogued under|mentions|touches on|looks slow|looks demanding|runs long/.test(note)) push(`Held back a little because it ${note}.`, 0.5);
  }
  return out
    .sort((a, b) => b.severity - a.severity)
    .map((t) => t.text)
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, 2);
}

/* ------------------------------------------------------------------ narrative */

const SIGNAL_NAME: Record<MatchReason["kind"], string> = {
  mood: "mood",
  genre: "genre",
  liked: "liked-book similarity",
  goal: "reading goal",
  pace: "pace",
  complexity: "complexity",
  length: "length",
  quality: "reader ratings",
  freeText: "your description",
  tone: "tone",
  maturity: "age range",
  theme: "shared themes",
  semantic: "semantic similarity",
};

function roleSentence(sb: ScoredBook, s: Signals): string | undefined {
  switch (sb.role) {
    case "perfect":
      return undefined;
    case "safe":
      return "Of the lot, this is the one closest to what you already know you like.";
    case "fresh":
      return sb.explanation?.explorationReason ?? "It keeps your core preferences but adds a new angle.";
    case "hiddenGem":
      return "Fewer Open Library readers have it on their shelves than the others here, but it matches just as well.";
    case "wildcard":
      return sb.explanation?.explorationReason ?? "A step sideways from your usual choices, chosen for how well the rest fits.";
    case "challenge": {
      const p = sb.profile;
      if (s.complexity && !s.complexity.inferred && p.complexity.value > s.complexity.target) return `You usually prefer ${s.complexity.chip.label.toLowerCase()}; this asks a bit more of you, and the rest of the match is strong.`;
      if (s.pace && !s.pace.inferred && p.pace.value < s.pace.target) return `You asked for ${s.pace.chip.label.toLowerCase()} reading; this one takes its time, and the rest of the match is strong.`;
      return "This asks a little more of you than the others, and the rest of the match is strong.";
    }
    default:
      return undefined;
  }
}

/** The structured explanation the UI consumes. Everything traces back to a scoring signal. */
export function buildExplanation(sb: ScoredBook, s: Signals, confidence: number, newConcept?: string): RecommendationExplanation {
  const strongestMatches = sb.reasons
    .filter((r) => r.kind !== "quality")
    .slice(0, 4)
    .map((r) => ({ signal: SIGNAL_NAME[r.kind], strength: Math.round(r.strength * 1000) / 1000, explanation: `${r.heading}. ${r.detail}`.replace(/\.\./g, ".") }));
  const tos = tradeoffs(sb, s);
  const explorationReason =
    sb.role === "wildcard" || sb.role === "fresh" ? (newConcept ? `It brings in ${newConcept}, which is new relative to what you asked for.` : "It steps a little outside what you asked for while keeping the core of it.") : sb.role === "challenge" ? roleSentence(sb, s) : undefined;

  const lead = sb.reasons.filter((r) => r.kind !== "quality").slice(0, 2);
  let summary: string;
  if (lead.length) {
    const what = lead.map((r) => r.heading.replace(/^You(?=['’ ])/, "you").replace(/^Your /, "your ").replace(/^Its /, "its ")).join(", and ");
    summary = `${what.charAt(0).toUpperCase()}${what.slice(1)}. ${lead[0].detail}`;
  } else summary = `${sb.book.title} scored well across the preferences you shared, though the catalog gives us little to quote.`;
  const role = roleSentence({ ...sb, explanation: { ...(sb.explanation ?? { strongestMatches: [], tradeoffs: [], confidence, summary: "" }), explorationReason } }, s);
  if (role) summary += ` ${role}`;
  if (tos.length) summary += ` One difference: ${tos[0].charAt(0).toLowerCase()}${tos[0].slice(1)}`;

  return { strongestMatches, tradeoffs: tos, explorationReason, confidence, summary };
}

/** A two or three sentence narrative for the featured pick, built from its strongest reasons. */
export function featuredNarrative(sb: { book: Book; reasons: MatchReason[] }, s: Signals): string {
  const liked = sb.reasons.find((r) => r.kind === "liked");
  const mood = sb.reasons.find((r) => r.kind === "mood");
  const first: string[] = [];
  if (liked) first.push(liked.heading.replace(/^You /, ""));
  if (mood) first.push(mood.heading.replace(/^You /, ""));
  else if (s.genres.length) first.push(`picked ${s.genres.map((g) => g.chip.label).slice(0, 2).join(" and ")}`);

  const lead = first.length ? `You ${first.join(" and ")}.` : "";
  const details = sb.reasons
    .filter((r) => r.kind !== "quality")
    .slice(0, 2)
    .map((r) => r.detail);
  const tail = details.length ? ` ${sb.book.title} stands out here. ${details.join(" ")}` : "";
  return `${lead}${tail}`.trim() || `${sb.book.title} scored highest across the preferences you shared.`;
}

/**
 * How the engine understood the reader, in a bookseller's voice:
 * "You seem to want something intellectually challenging but still fast-moving. Since you liked Dune,
 *  we prioritized ambitious speculative fiction, then added one slightly more literary choice."
 */
export function profileNarrative(s: Signals, picks: ScoredBook[], clearWinner: boolean): string {
  const sentences: string[] = [];
  const wants: string[] = [];
  if (s.complexity && !s.complexity.inferred) wants.push(s.complexity.target >= 0.7 ? "intellectually challenging" : s.complexity.target <= 0.3 ? "easy to sink into" : "moderately challenging");
  if (s.pace && !s.pace.inferred) wants.push(s.pace.target >= 0.7 ? "fast-moving" : s.pace.target <= 0.3 ? "slow and atmospheric" : "steadily paced");
  if (s.intensity) wants.push(s.intensity.target >= 0.7 ? "emotionally intense" : s.intensity.target <= 0.25 ? "light" : "moderately emotional");
  const moodPhrases = s.moods.map((m) => MOODS.find((o) => o.title === m.chip.label)?.phrase).filter((p): p is string => !!p);
  if (wants.length && moodPhrases.length) sentences.push(`You seem to want ${moodPhrases[0]}, ${wants.length > 1 ? `${wants.slice(0, -1).join(", ")} but ${wants[wants.length - 1]}` : wants[0]}.`);
  else if (wants.length) sentences.push(`You seem to want something ${wants.length > 1 ? `${wants.slice(0, -1).join(", ")} but ${wants[wants.length - 1]}` : wants[0]}.`);
  else if (moodPhrases.length) sentences.push(`You wanted ${list(moodPhrases.slice(0, 2))}.`);

  const liked = s.liked.filter((l) => l.origin === "liked");
  const refs = s.liked.filter((l) => l.origin === "reference");
  const latentLabels = (Object.entries(s.latent) as Array<[TagId, number]>)
    .filter(([id, v]) => v >= 0.5 && !["classics"].includes(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => CONCEPT_PHRASE[id] ?? TAGS[id].label);
  if (liked.length && latentLabels.length) sentences.push(`Since you liked ${list(liked.slice(0, 3).map((l) => l.title))}, we prioritized ${list(latentLabels)}.`);
  else if (liked.length) sentences.push(`We leaned on what ${list(liked.slice(0, 3).map((l) => l.title))} ${liked.length > 1 ? "have" : "has"} in common with the catalog.`);
  else if (refs.length) sentences.push(`We treated ${list(refs.map((r) => r.title))} as a touchstone${latentLabels.length ? ` and looked for ${list(latentLabels)}` : ""}.`);
  else if (s.genres.length && !wants.length && !moodPhrases.length) sentences.push(`You picked ${list(s.genres.map((g) => g.chip.label).slice(0, 3))}.`);

  if (s.freeText) {
    const positives = (Object.keys(s.freeText.tags) as TagId[]).slice(0, 3).map((t) => TAGS[t].label);
    if (positives.length) sentences.push(`From your own words we took ${list(positives)}${s.negativeConcepts.length ? `, and kept ${list(s.negativeConcepts.slice(0, 2))} out` : ""}.`);
  } else if (s.negativeConcepts.length) sentences.push(`We kept ${list(s.negativeConcepts.slice(0, 3))} out.`);

  for (const c of s.conflicts.slice(0, 1)) sentences.push(`You asked for ${c.between[0]} and ${c.between[1]}, so ${c.resolution}.`);

  const special = picks.filter((p) => p.role && ["fresh", "wildcard", "challenge", "hiddenGem"].includes(p.role)).slice(0, 2);
  if (special.length) {
    const bits = special.map((p) => (p.role === "hiddenGem" ? `a lesser-known pick (${p.book.title})` : p.role === "challenge" ? `one that asks a little more of you (${p.book.title})` : `one slightly outside your usual (${p.book.title})`));
    sentences.push(`Then we added ${list(bits)}.`);
  }
  if (picks.length >= 2 && !clearWinner) sentences.push("The top picks finished close together, so treat the order loosely.");
  return sentences.join(" ").trim();
}
