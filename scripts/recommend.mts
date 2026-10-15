/**
 * Development-only recommendation runner against the live catalog.
 *
 *   npm run rec -- --scenario a            # Profile A (sci-fi, fast, think, Dune + Project Hail Mary, no romance)
 *   npm run rec -- --scenario blackmirror  # free text
 *   npm run rec -- --scenario custom --prefs '{"moods":["cozy"],"readingLength":"quick"}'
 *   npm run rec -- --scenario a --debug    # every candidate's component scores
 *   npm run rec -- --scenario a --no-embed # metadata-only fallback
 *   npm run rec -- --like OL893415W --scenario a   # "more like this" blended with the profile
 *
 * Runs with `--conditions react-server` so `server-only` resolves to an empty module.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

// Load .env the way Next does (optional keys only).
try {
  const env = readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env */
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (flag("no-embed")) process.env.LIBRIA_EMBEDDINGS = "off";

const { EMPTY_PREFERENCES } = await import("@/types/preferences");
const { recommend, similarTo } = await import("@/lib/recommendations/recommendationEngine");
const { searchBooks } = await import("@/lib/api/bookSearch");
const { embedderStatus } = await import("@/lib/recommendations/semantic/embedder");

type Prefs = typeof EMPTY_PREFERENCES;

async function likedByTitle(...titles: string[]) {
  const out: Prefs["likedBooks"] = [];
  for (const t of titles) {
    const hits = await searchBooks(t, 3);
    const hit = hits[0];
    if (hit) out.push({ id: hit.id, title: hit.title, authors: hit.authors });
    else console.warn(`could not resolve liked book: ${t}`);
  }
  return out;
}

const SCENARIOS: Record<string, () => Promise<Partial<Prefs>>> = {
  a: async () => ({ genres: ["science-fiction"], moods: ["think"], pace: "fast", likedBooks: await likedByTitle("Dune", "Project Hail Mary"), dislikedThemes: ["romance"] }),
  b: async () => ({ moods: ["cozy", "emotional"], genres: ["romance"], readingLength: "quick", complexity: "easy" }),
  c: async () => ({ moods: ["uncomfortable", "hooked"], genres: ["mystery", "thriller"], complexity: "challenging", endingPreference: "dark" }),
  d: async () => ({ moods: ["grow"], genres: ["psychology", "business", "self-help"], goals: ["motivation", "myself"] }),
  e: async () => ({}),
  blackmirror: async () => ({ freeText: "I want something like Black Mirror but more philosophical and less depressing." }),
  dune: async () => ({ likedBooks: await likedByTitle("Dune") }),
  "dune-martian": async () => ({ likedBooks: await likedByTitle("Dune", "The Martian") }),
  horror: async () => ({ genres: ["science-fiction"], dislikedThemes: ["horror"] }),
  sanderson: async () => ({ genres: ["fantasy"], moods: ["escape"], likedBooks: await likedByTitle("Mistborn", "The Way of Kings") }),
  conflict: async () => ({ moods: ["emotional"], emotionalIntensity: "devastating", dislikedThemes: ["depressing"], genres: ["literary-fiction"] }),
  custom: async () => JSON.parse(opt("prefs") ?? "{}"),
};

const name = opt("scenario") ?? "a";
const make = SCENARIOS[name];
if (!make) {
  console.error(`unknown scenario ${name}; choose one of ${Object.keys(SCENARIOS).join(", ")}`);
  process.exit(1);
}
const prefs: Prefs = { ...EMPTY_PREFERENCES, ...(await make()) };
const debug = flag("debug");
const like = opt("like");

console.log(`\n=== scenario ${name} ===`);
console.log(JSON.stringify({ ...prefs, likedBooks: prefs.likedBooks.map((l) => l.title) }));
const t0 = Date.now();
const result = like ? await similarTo(like, prefs, { debug }) : await recommend(prefs, { debug });
console.log(`\n${result.recommendations.length} picks from ${result.poolSize} candidates in ${Date.now() - t0}ms · engine ${result.engineVersion} · semantic=${result.semantic} · confidence ${result.confidence} (${result.confidenceScore}) · clearWinner=${result.clearWinner}`);
console.log(`embedder: ${JSON.stringify(embedderStatus())}`);
console.log(`\nprofile: ${result.profileSummary}`);
if (result.conflicts.length) console.log(`conflicts: ${result.conflicts.map((c) => `${c.between.join(" vs ")} → ${c.resolution}`).join("; ")}`);
console.log(`chips: ${result.chips.map((c) => c.label).join(" | ")}\n`);

const fmt = (n: number | undefined) => (n === undefined ? "  - " : n.toFixed(2));
for (const [i, sb] of result.recommendations.entries()) {
  const c = sb.components;
  console.log(`${String(i + 1).padStart(2)}. ${sb.book.title} — ${sb.book.authors[0]} (${sb.book.publishedYear ?? "?"}, ${sb.book.pageCount ?? "?"}p)`);
  console.log(`    score ${sb.score.toFixed(3)}  role=${sb.role}  conf=${sb.confidence}  routes=${sb.routes?.join(",")}  novelty=${fmt(sb.novelty)} fam=${fmt(sb.familiarity)} pop=${fmt(sb.popularityPercentile)}`);
  console.log(`    sem ${fmt(c.semantic)} genre ${fmt(c.genreMatch)} liked ${fmt(c.likedBookSimilarity)} theme ${fmt(c.themeMatch)} mood ${fmt(c.moodMatch)} goal ${fmt(c.goalMatch)} pace ${fmt(c.paceMatch)} cplx ${fmt(c.complexityMatch)} len ${fmt(c.lengthMatch)} text ${fmt(c.freeTextMatch)} tone ${fmt(c.toneMatch)} mq ${fmt(c.metadataQuality)} q ${fmt(c.quality)}`);
  if (sb.penalties.length) console.log(`    penalties: ${sb.penalties.join("; ")}`);
  console.log(`    why: ${sb.explanation?.summary}`);
  if (sb.tradeoffs?.length) console.log(`    tradeoffs: ${sb.tradeoffs.join(" | ")}`);
}

if (debug && result.debug) {
  const d = result.debug;
  console.log(`\n--- timings (ms): ${JSON.stringify(d.timings)}`);
  console.log(`--- semantic: ${JSON.stringify(d.semantic)}`);
  console.log(`--- queries:`);
  for (const q of d.queries) console.log(`  [${q.route}] ${q.returned} in ${q.ms}ms${q.failed ? " FAILED" : ""} :: ${q.q} (${q.sort ?? "relevance"}, ${q.limit})`);
  console.log(`--- ${d.filtered} filtered, top candidates:`);
  const rows = d.candidates.filter((c) => !c.filtered).slice(0, Number(opt("top") ?? 30));
  for (const c of rows) {
    const k = c.components;
    console.log(`  ${c.selected ? "*" : " "} ${c.final.toFixed(3)} (base ${c.base.toFixed(2)} ×${c.penaltyMultiplier.toFixed(2)}) ${c.title} — ${c.author} [${c.routes.join(",")}] sem ${fmt(k.semantic)} gen ${fmt(k.genreMatch)} lik ${fmt(k.likedBookSimilarity)} thm ${fmt(k.themeMatch)} mood ${fmt(k.moodMatch)} pace ${fmt(k.paceMatch)} mq ${fmt(k.metadataQuality)} q ${fmt(k.quality)} nov ${fmt(c.novelty)}${c.penalties.length ? ` :: ${c.penalties.join("; ")}` : ""}`);
  }
  const dropped = d.candidates.filter((c) => c.filtered);
  if (dropped.length) {
    console.log(`--- filtered out:`);
    for (const c of dropped.slice(0, 25)) console.log(`    ${c.title} — ${c.author}: ${c.filtered}`);
  }
}
process.exit(0);
