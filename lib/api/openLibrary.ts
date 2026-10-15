import "server-only";
import type { Book } from "@/types/book";
import { olCoverUrl } from "@/lib/utils/covers";
import { fetchJson, memo } from "./http";
import {
  cleanDescription,
  isLatin,
  isRecord,
  num,
  numArray,
  pickIsbn,
  str,
  strArray,
  tidyTitle,
  uniq,
  year,
  type Json,
} from "./validate";

const BASE = "https://openlibrary.org";

/** Fields requested from search.json. Keeping this list tight keeps payloads small. */
const SEARCH_FIELDS = [
  "key",
  "title",
  "subtitle",
  "author_name",
  "author_key",
  "author_alternative_name",
  "contributor",
  "first_publish_year",
  "cover_i",
  "number_of_pages_median",
  "ratings_average",
  "ratings_count",
  "want_to_read_count",
  "already_read_count",
  "subject",
  "first_sentence",
  "language",
  "editions",
  "editions.title",
  "editions.subtitle",
  "editions.cover_i",
  "editions.isbn",
  "editions.publisher",
  "editions.language",
].join(",");

const SUMMARY_FIELDS = ["key", "title", "author_name", "author_key", "author_alternative_name", "first_publish_year", "cover_i", "editions", "editions.title", "editions.cover_i", "editions.language"].join(",");

export type OpenLibrarySort = "relevance" | "rating" | "readinglog" | "want_to_read" | "new" | `random_${number}`;

export interface OpenLibrarySearchParams {
  /** Raw Solr-style query, e.g. subject:"science fiction" AND ratings_count:[20 TO *] */
  q: string;
  limit?: number;
  offset?: number;
  sort?: OpenLibrarySort;
  /** Summary mode only requests the fields needed for autocomplete. */
  summary?: boolean;
  ttlMs?: number;
}

export interface OpenLibrarySearchResult {
  total: number;
  books: Book[];
}

export async function searchOpenLibrary(params: OpenLibrarySearchParams): Promise<OpenLibrarySearchResult> {
  const url = new URL(`${BASE}/search.json`);
  url.searchParams.set("q", params.q);
  url.searchParams.set("fields", params.summary ? SUMMARY_FIELDS : SEARCH_FIELDS);
  url.searchParams.set("limit", String(params.limit ?? 30));
  // Boosts (does not restrict to) English editions in the `editions` sub-document. The boost competes
  // with ebook availability, and edition language labels are crowd-edited, so the one edition that
  // comes back is not always English: see pickDisplayTitle and getOpenLibraryEnglishEdition.
  url.searchParams.set("lang", "en");
  if (params.offset) url.searchParams.set("offset", String(params.offset));
  if (params.sort && params.sort !== "relevance") url.searchParams.set("sort", params.sort);

  const json = await fetchJson<Json>(url.toString(), { ttlMs: params.ttlMs });
  if (!isRecord(json) || !Array.isArray(json.docs)) return { total: 0, books: [] };
  const books = json.docs.map(normalizeSearchDoc).filter((b): b is Book => b !== undefined);
  return { total: num(json.numFound) ?? books.length, books };
}

/** Look up one work through the search index (fast, includes ratings, authors and an English edition). */
export async function getOpenLibrarySearchDoc(workId: string): Promise<Book | undefined> {
  const { books } = await searchOpenLibrary({ q: `key:/works/${workId}`, limit: 1 });
  return books[0];
}

export interface OpenLibraryWorkDetails {
  workId: string;
  title?: string;
  description?: string;
  subjects: string[];
  coverIds: number[];
  firstSentence?: string;
}

/** The work record holds the description and the canonical subject list. Follows one redirect. */
export async function getOpenLibraryWork(workId: string, depth = 0): Promise<OpenLibraryWorkDetails | undefined> {
  const json = await fetchJson<Json>(`${BASE}/works/${encodeURIComponent(workId)}.json`, { ttlMs: 24 * 3600_000 });
  if (!isRecord(json)) return undefined;
  const type = isRecord(json.type) ? str(json.type.key) : undefined;
  if (type === "/type/redirect" && depth < 2) {
    const target = str(json.location)?.match(/OL\d+W/)?.[0];
    return target ? getOpenLibraryWork(target, depth + 1) : undefined;
  }
  const id = str(json.key)?.match(/OL\d+W/)?.[0] ?? workId;
  return {
    workId: id,
    title: str(json.title),
    description: cleanDescription(str(json.description)),
    subjects: uniq([
      ...strArray(json.subjects),
      ...strArray(json.subject_places).slice(0, 4),
      ...strArray(json.subject_times).slice(0, 3),
    ]),
    coverIds: numArray(json.covers).filter((c) => c > 0),
    firstSentence: str(json.first_sentence),
  };
}

/** Open Library's public trending lists (daily / weekly / monthly reading-log activity). */
export async function getOpenLibraryTrending(period: "daily" | "weekly" | "monthly", limit = 30): Promise<Book[]> {
  const json = await fetchJson<Json>(`${BASE}/trending/${period}.json?limit=${limit}`, { ttlMs: 3 * 3600_000 });
  if (!isRecord(json) || !Array.isArray(json.works)) return [];
  return json.works.map(normalizeSearchDoc).filter((b): b is Book => b !== undefined);
}

/* ---------------------------------------------------------------- English edition */

export interface OpenLibraryEnglishEdition {
  /** The title most of the work's English-labelled editions share; absent when no edition is labelled English. */
  title?: string;
  /** Subtitle carried by at least half of those editions, if any. */
  subtitle?: string;
  /** How many editions carry that title: a single one is no better evidence than the search index gave. */
  votes: number;
  /** Authors credited on enough of the work's editions to be its authors (see creditedAuthorKeys), most credited first. */
  authorKeys?: string[];
}

const EDITION_SAMPLE = 50;
const DAY = 24 * 3600_000;

/**
 * The search index returns one edition per work and its language label is crowd-edited, so the
 * "English" edition is sometimes a translation ("Anatema") or a romanised original ("Coffee Ga
 * Samenai Uchi Ni"). The work's edition list settles it by majority: one call per work, cached for
 * a day as the small derived result (the raw edition list is never kept). The same list says which
 * of the work's listed authors are credited on its editions at large and which only on a translation.
 */
export async function getOpenLibraryEnglishEdition(workId: string): Promise<OpenLibraryEnglishEdition | undefined> {
  const found = await memo<OpenLibraryEnglishEdition | null>(`ol-english-edition:${workId}`, DAY, async () => {
    const json = await fetchJson<Json>(`${BASE}/works/${encodeURIComponent(workId)}/editions.json?limit=${EDITION_SAMPLE}`, { ttlMs: 0 });
    const entries = isRecord(json) && Array.isArray(json.entries) ? json.entries : [];
    const english = pickEnglishEditionTitle(entries);
    const authorKeys = creditedAuthorKeys(entries);
    if (!english && authorKeys.length === 0) return null;
    return { ...(english ?? { votes: 0 }), authorKeys };
  });
  return found ?? undefined;
}

/** An edition list is evidence about authors only once it has a few editions. */
const CREDIT_SAMPLE = 4;

/**
 * Author keys credited on the work's editions, most credited first, dropping those credited on
 * fewer than a fifth as many editions as the most credited author (and on fewer than two): a
 * translator or illustrator listed as an author of one foreign edition reaches the work's author
 * list, but never its English editions. Empty when the list is too short to say anything.
 */
export function creditedAuthorKeys(entries: Json[]): string[] {
  const counts = new Map<string, number>();
  let editions = 0;
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.authors)) continue;
    const keys = uniq(entry.authors.map((a) => (isRecord(a) ? str(a.key)?.match(/OL\d+A/)?.[0] : undefined)).filter((k): k is string => k !== undefined));
    if (keys.length === 0) continue;
    editions++;
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (editions < CREDIT_SAMPLE) return [];
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0][1];
  return ranked.filter(([, n]) => n >= 2 && n * 5 >= top).map(([k]) => k);
}

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const shouting = (s: string) => s === s.toUpperCase() || s === s.toLowerCase();

const LEADING_ARTICLE = /^(the|a|an) /;

/** The words of a title: case, accents, punctuation and parenthetical qualifiers set aside. */
function titleWords(title: string): string {
  return fold(title)
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Grouping key for titles: library cataloguing also drops the leading article ("Dispossessed", "Dispossessed, the"). */
function titleKey(title: string): string {
  return titleWords(title).replace(LEADING_ARTICLE, "");
}

/** Majority title among the English-labelled editions of a work (entries of /works/{id}/editions.json). */
export function pickEnglishEditionTitle(entries: Json[]): OpenLibraryEnglishEdition | undefined {
  interface Group {
    votes: number;
    variants: Map<string, { title: string; count: number }>;
    subtitles: Map<string, number>;
  }
  const groups = new Map<string, Group>();
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const languages = Array.isArray(entry.languages) ? entry.languages.map((l) => (isRecord(l) ? str(l.key) : undefined)) : [];
    if (!languages.includes("/languages/eng")) continue;
    const title = str(entry.title, 300)
      ?.replace(/\s*[([][^)\]]*[)\]]\s*/g, " ")
      .replace(/^\s*(.*?),\s*(the|a|an)\s*$/i, "$2 $1") // "Dispossessed, the" → "the Dispossessed"
      .replace(/\s+/g, " ")
      .trim();
    if (!title || !isLatin(title)) continue;
    const key = titleKey(title);
    if (!key) continue;
    let group = groups.get(key);
    if (!group) {
      group = { votes: 0, variants: new Map(), subtitles: new Map() };
      groups.set(key, group);
    }
    group.votes++;
    const variantKey = title.toLowerCase();
    const variant = group.variants.get(variantKey);
    if (!variant) group.variants.set(variantKey, { title, count: 1 });
    else {
      variant.count++;
      if (shouting(variant.title) && !shouting(title)) variant.title = title;
    }
    const subtitle = str(entry.subtitle, 300);
    if (subtitle) group.subtitles.set(subtitle, (group.subtitles.get(subtitle) ?? 0) + 1);
  }
  const best = [...groups.values()].sort((a, b) => b.votes - a.votes)[0];
  if (!best) return undefined;
  // Catalogers drop articles but never add them: a variant that keeps "The …" is the real title even when outvoted.
  const variants = [...best.variants.values()].sort((a, b) => b.count - a.count || a.title.length - b.title.length);
  const withArticle = variants.find((v) => LEADING_ARTICLE.test(v.title.toLowerCase()));
  const chosen = withArticle ?? variants[0];
  const title = chosen.title.replace(/^(the|a|an) /i, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  const subtitle = [...best.subtitles.entries()].sort((a, b) => b[1] - a[1])[0];
  return { title, subtitle: subtitle && subtitle[1] * 2 >= best.votes ? subtitle[0] : undefined, votes: best.votes };
}

/** Keep only the authors the work's editions credit; a record never loses all of its authors. */
function creditAuthors(book: Book, credited: string[] | undefined): Book {
  if (!credited?.length || !book.authorKeys || book.authorKeys.length !== book.authors.length) return book;
  const keep = book.authorKeys.map((k) => credited.includes(k));
  if (keep.every(Boolean) || !keep.some(Boolean)) return book;
  return { ...book, authors: book.authors.filter((_, i) => keep[i]), authorKeys: book.authorKeys.filter((_, i) => keep[i]) };
}

/**
 * Swap in the title the work's English editions share when the catalog gave another one, and drop
 * listed authors its editions do not credit; otherwise leave the record alone.
 */
export function applyEnglishEdition(record: Book, english: OpenLibraryEnglishEdition | undefined): Book {
  if (!english || record.source !== "openlibrary") return record;
  const book = creditAuthors(record, english.authorKeys);
  if (!english.title) return book;
  if (titleKey(english.title) === titleKey(book.title)) {
    // Same title. Differing only by a leading article: the work title's article is right, keep it.
    if (titleWords(english.title) !== titleWords(book.title)) return book;
    // Same words: adopt the editions' form (drops "(Centennial Ed. HC)", "Notes from the Underground" over a title-cased guess).
    return english.votes >= 2 && !shouting(english.title) && english.title !== book.title ? { ...book, title: english.title } : book;
  }
  // One English edition is no stronger evidence than the search index already gave, unless the current title is plainly not English.
  if (english.votes < 2 && titleEnglishness(book.title) >= 0) return book;
  return {
    ...book,
    title: tidyTitle(english.title),
    subtitle: english.subtitle,
    seriesVolume: book.seriesVolume ?? volumeFromTitles([english.title]),
  };
}

/* ---------------------------------------------------------------- normalize */

/** "Kawaguchi, Toshikazu" → "Toshikazu Kawaguchi" */
function uninvert(name: string): string {
  const m = name.match(/^([^,]+),\s*([^,]+)$/);
  return m && isLatin(name) ? `${m[2].trim()} ${m[1].trim()}` : name;
}

/** A spelling worth showing: Latin script, a few distinct words ("Fyodor Fyodor Dostoevsky" is a catalog slip), no dates or list separators. */
function plausibleName(name: string): boolean {
  const words = nameTokens(name);
  return isLatin(name) && !name.includes(",") && !/\d/.test(name) && name.length < 40 && words.length >= 1 && words.length <= 4 && new Set(words).size === words.length;
}

const ASCII = /^[\x20-\x7e]+$/;

/** "DOSTOYEVSKY" → "Dostoyevsky", "SAINT-EXUPERY" → "Saint-Exupery", "O'BRIEN" → "O'Brien". */
function capitalizeWord(word: string): string {
  return word.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** Generational and regnal numerals that occur in names and must stay upper-case. */
const NUMERAL = /^(?:II|III|IV|VI|VII|VIII|IX|XI|XII|XIII|XIV|XV|XVI)$/;

/**
 * "NEAL STEPHENSON" / "neal stephenson" → "Neal Stephenson", "Fedor DOSTOYEVSKY" → "Fedor Dostoyevsky".
 * Inside a mixed-case name only shouting words of three or more letters are touched, so initials
 * ("DC", "J.R.R.", "F. M.") and numerals ("Henry VIII") stay as they are.
 */
export function tidyName(name: string): string {
  if (!isLatin(name)) return name;
  const whole = shouting(name);
  return name
    .split(" ")
    .map((w) => {
      const letters = w.replace(/[^\p{L}]/gu, "");
      if (!letters || w.includes(".") || NUMERAL.test(letters)) return w;
      const upper = letters === letters.toUpperCase();
      return (upper && letters.length >= 3) || whole ? capitalizeWord(w) : w;
    })
    .join(" ");
}

/**
 * The catalog keeps one current spelling per author plus every alias seen across editions, and the
 * current one is sometimes another script (村上春樹), a local transliteration ("Fiódor Dostoievski")
 * or a shouting snapshot ("Fedor DOSTOYEVSKY"). The aliases vote: spellings that differ only by case,
 * accents or punctuation are one spelling ("Fyodor Dostoyevsky", "Fyodor DOSTOYEVSKY", "Dostoyevsky,
 * Fyodor"), and the one the most aliases use wins; word frequency breaks ties, and the current
 * spelling keeps a tie after that. Only the English catalog's own spellings vote (plain ASCII; accented
 * aliases come from foreign editions, "Fédor Dostoïevski"), unless there are none. Plain ASCII names
 * in ordinary case are never second-guessed.
 */
export function conventionalSpelling(name: string, aliases: string[]): string {
  const suspect = !isLatin(name) || !ASCII.test(name) || tidyName(name) !== name;
  if (!suspect || aliases.length === 0) return tidyName(name);
  const tokens = (s: string) => fold(s).split(/\s+/).filter(Boolean);
  const own = plausibleName(name) ? tokens(name) : [];
  // Only spellings of the same person vote: an alias must share a word stem with the current spelling
  // (nothing can be checked against a non-Latin spelling, so every alias counts then).
  const related = (alias: string) => own.length === 0 || tokens(alias).some((t) => t.length >= 4 && own.some((o) => o.length >= 4 && o.slice(0, 4) === t.slice(0, 4)));
  const pool = aliases.filter((a) => plausibleName(a) && related(a));
  const english = pool.filter((a) => ASCII.test(a));
  const candidates = english.length > 0 ? english : pool;
  if (candidates.length === 0) return tidyName(name);

  const freq = new Map<string, number>();
  for (const c of [...(own.length ? [name] : []), ...candidates]) for (const t of tokens(c)) freq.set(t, (freq.get(t) ?? 0) + 1);
  const score = (s: string) => {
    const ts = tokens(s);
    return ts.reduce((sum, t) => sum + (freq.get(t) ?? 0), 0) / ts.length;
  };
  const groups = new Map<string, string[]>();
  for (const c of candidates) {
    const key = tokens(c).join(" ");
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const ownKey = own.join(" ");
  const [key, members] = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || score(b[0]) - score(a[0]) || (a[0] === ownKey ? -1 : b[0] === ownKey ? 1 : 0),
  )[0];
  if (key === ownKey) return tidyName(name);
  return tidyName(members.find((m) => tidyName(m) === m) ?? members[0]);
}

/** The words of a name, folded: "Garnett, Constance Black, 1862-1946." → ["garnett", "constance", "black"]. */
function nameTokens(name: string): string[] {
  return fold(name)
    .split(/[\s,]+/)
    .map((t) => t.replace(/[^\p{L}'-]/gu, ""))
    .filter(Boolean);
}

/**
 * Whether two spellings name the same person: every word of the shorter one occurs in the longer
 * ("Alvaro Abella" in "Álvaro Abella Villar"), an initial matching any word it starts ("James L. Roberts"
 * and "James Lamar Roberts"), and at least one real word in common.
 */
export function sameName(a: string, b: string): boolean {
  const [short, long] = [nameTokens(a), nameTokens(b)].sort((x, y) => x.length - y.length);
  if (short.length === 0) return false;
  const matches = (t: string, u: string) => t === u || (t.length === 1 && u.startsWith(t)) || (u.length === 1 && t.startsWith(u));
  return short.every((t) => long.some((u) => matches(t, u))) && short.some((t) => t.length >= 3 && long.includes(t));
}

/* A contributor entry that names a role: "Garnett, Constance, 1861-1946, translator", "Magarshack, David, tr.",
 * "Ignat Avsey (Translator)", "Sharp, William, 1900- illus.", "Maire Jaanus (Introduction)". */
const ROLE =
  "(?:joint\\s+)?(?:translat\\w*|trans|tr|illustrat\\w*|illus|ill|editor|ed|narrat\\w*|reader|read by|introduction|foreword|afterword|preface|photograph\\w*|cover art(?:ist)?|adapt\\w*|abridg\\w*|compil\\w*|comp|designer|commentar\\w*|annotat\\w*|writer of \\w+)";
const ROLE_TAIL = new RegExp(`(?:\\(${ROLE}\\.?\\)|[\\d.\\-]\\s*${ROLE}\\.?|,\\s*${ROLE}\\.?)\\s*$`);

/** The folded names of contributors the catalog knows in a non-author role (translator, illustrator, editor, narrator…). */
function roleContributors(doc: Record<string, Json>): string[] {
  const out: string[] = [];
  for (const raw of strArray(doc.contributor, 150)) {
    const entry = fold(raw).trim();
    const tail = entry.match(ROLE_TAIL)?.[0];
    if (!tail) continue;
    // After a comma, a short role word needs a third comma-separated part behind it: "Brubaker, Ed" is a name.
    if (tail.startsWith(",") && tail.replace(/^,\s*(joint\s+)?/, "").replace(/\.$/, "").length < 4 && (entry.match(/,/g)?.length ?? 0) < 2) continue;
    const name = entry.split(/[(\d]/)[0].replace(ROLE_TAIL, "");
    if (nameTokens(name).length > 0) out.push(name);
  }
  return out;
}

export interface OpenLibraryAuthor {
  name: string;
  /** Open Library author key (OL123A) when the record carries one per name. */
  key?: string;
}

/** Shown authors are capped: anthologies and translator-laden records list far more than the UI can name. */
const MAX_AUTHORS = 3;

/**
 * The work's authors in the catalog's order, each in its conventional spelling, without the same person
 * listed twice ("Álvaro Abella Villar", "Alvaro Abella") and without later names the catalog itself
 * credits as translators or illustrators elsewhere on the record. At most MAX_AUTHORS.
 */
export function pickAuthorEntries(doc: Record<string, Json>): OpenLibraryAuthor[] {
  const raw = strArray(doc.author_name, 8);
  if (raw.length === 0) return [];
  // A stray trailing comma ("Fyodor Dostoyevsky,") is a catalog slip, not another spelling.
  const clean = (s: string) => uninvert(s.replace(/[,;]+$/, "").trim());
  const names = raw.map(clean);
  const keys = strArray(doc.author_key, 8);
  const aliases = strArray(doc.author_alternative_name, 250).map(clean);
  const roles = roleContributors(doc);
  const kept: OpenLibraryAuthor[] = [];
  names.forEach((name, i) => {
    // Aliases that are another listed author's current spelling usually belong to that author (translators,
    // co-authors), unless the same person is listed twice under two scripts and those are the only Latin aliases.
    const others = new Set(names.filter((n) => n !== name).map(fold));
    const own = conventionalSpelling(
      name,
      aliases.filter((a) => !others.has(fold(a))),
    );
    const spelled = isLatin(own) ? own : conventionalSpelling(name, aliases);
    if (kept.some((k) => sameName(k.name, spelled))) return;
    if (kept.length > 0 && roles.some((r) => sameName(r, spelled))) return;
    kept.push({ name: spelled, key: keys.length === raw.length ? keys[i] : undefined });
  });
  return kept.slice(0, MAX_AUTHORS);
}

export function pickAuthor(doc: Record<string, Json>): string[] {
  return pickAuthorEntries(doc).map((a) => a.name);
}

function firstEnglishEdition(doc: Record<string, Json>): Record<string, Json> | undefined {
  const editions = isRecord(doc.editions) && Array.isArray(doc.editions.docs) ? doc.editions.docs.filter(isRecord) : [];
  return editions.find((e) => strArray(e.language).includes("eng")) ?? editions[0];
}

/* Common words of English titles, and of the languages Open Library most often mislabels as English.
 * Words that exist in both ("a", "in", "no", "die"…) are left out of the English list so they never vote for English. */
const ENGLISH_WORDS = new Set(
  "the of and from with into about after before between through without within against among upon are were been its you your our we they their his her him she he who whom what when where why how this that these those there here all every some any not never only other another one two three first last new old little big great good long short lost dark light black white red blue green silver life lives death dead world night day days year years time man men woman women girl boy child children house home city road river sea sky star stars moon sun peace love heart blood bones fire water earth stone king queen prince princess lord lady book books story stories tale tales secret secrets history end beginning way things thing people name song songs shadow shadows dream dreams memory memories guide notes letters journey mystery murder wife daughter mother father brother sister friend friends my it be".split(
    " ",
  ),
);
const FOREIGN_WORDS = new Set(
  (
    "el la los las del de al un una uno unos unas y con sobre por para que como cuando donde mas muy es esta este estos estas ese esa eso nuestro nuestra mi mis tu tus su sus " +
    "o os um uma uns umas na nos nas em ao aos nao com pelo pela seu sua meu minha nosso nossa " +
    "il lo gli le della dello dei degli delle dal dalla dalle nel nella nelle nei alla alle agli col per che chi non piu e ed di tra fra questo questa quel quella mio mia suo nostro nostra io noi loro sono " +
    "les des du une et ou au aux dans sur pour avec sans est qui ce cette ces mon ma mes ses notre votre leur leurs chez vers je elle nous vous ils elles pas ne plus tres toute tout tous toutes petit petite grande nuit vie mort monde homme femme fille histoire histoires amour temps jour jours " +
    "der die das den dem ein eine einer eines einem einen und oder mit ohne von vom zum zur zu auf aus fur uber unter nach bei im ist nicht kein keine wie als wenn ich du er sie wir ihr mein meine dein deine sein seine ihre unser unsere welt nacht leben tod mann frau madchen geschichte liebe zeit jahre jahr tage haus kleine kleiner grosse " +
    "het een en van voor met op aan uit bij naar niet zijn haar hun ons onze mijn jouw dag wereld dood liefde verhaal verhalen " +
    "og och att det ett av pa om ar ikke inte jeg jag vi han hun hon hennes hans min mitt din ditt dom som var natt liv dod karlek kjaerlighet verden varlden " +
    "si cu pe din pentru sunt ale ai " +
    "w z nie sie jest od po za przez dla jak ja ty wy oni nad pod " +
    "ve bir bu icin ile kadar " +
    "dan ke dari yang untuk dengan " +
    "ga wa ni wo kara desu"
  ).split(" "),
);

/**
 * Rough "does this read as English?" score: +1 per common English word, −1 per common word of another
 * language; non-Latin script scores −∞. Only ever compared between two titles of the same work.
 */
export function titleEnglishness(title: string): number {
  if (!isLatin(title)) return Number.NEGATIVE_INFINITY;
  let score = 0;
  // Parenthetical qualifiers ("(Dune Chronicles, Book 2)") are catalog notes, not the title.
  for (const raw of title.replace(/\(.*?\)|\[.*?\]/g, " ").toLowerCase().split(/[^\p{L}]+/u)) {
    if (!raw) continue;
    if (ENGLISH_WORDS.has(raw)) score++;
    else if (FOREIGN_WORDS.has(raw) || FOREIGN_WORDS.has(fold(raw))) score--;
  }
  return score;
}

/**
 * Work title vs the title of the edition the index labelled English: show the one that reads as English.
 * The work title keeps a tie ("Anathem" over a mislabelled "Anatema", "Dune Messiah" over
 * "Dune Messiah (Dune Chronicles, Book 2)") unless it is not Latin script.
 */
export function pickDisplayTitle(workTitle: string | undefined, editionTitle: string | undefined): string | undefined {
  if (!workTitle) return editionTitle;
  if (!editionTitle) return workTitle;
  const w = titleEnglishness(workTitle);
  const e = titleEnglishness(editionTitle);
  if (e > w) return editionTitle;
  if (w > e) return workTitle;
  return isLatin(workTitle) ? workTitle : editionTitle;
}

const VOLUME_IN_TITLE = /\b(?:book|vol\.?|volume|part|#)\s*(\d{1,2})\b/i;

/** A trailing "(Centennial Ed. HC)", "(Dune Chronicles, Book 2)", "[Annotated]": a catalog note, not part of the title. */
const CATALOG_NOTE = /\s+[([]([^)\]]*\b(?:ed|edition|book|vol|volume|part|series|chronicles|hc|pb|hardcover|paperback|annotated|illustrated|unabridged|abridged|classics?|library|collection|boxed|set|\d+)\b[^)\]]*)[)\]]\s*$/i;

/** Drop a trailing catalog note from a display title; the series volume is read from the full title beforehand. */
export function stripCatalogNote(title: string): string {
  const stripped = title.replace(CATALOG_NOTE, "").trim();
  return stripped.length >= 2 ? stripped : title;
}

/** "Death's End (The Three-Body Problem Series Book 3)": the volume number from any title the catalog offers. */
function volumeFromTitles(titles: Array<string | undefined>): number | undefined {
  for (const t of titles) {
    const m = t?.match(VOLUME_IN_TITLE);
    if (m) {
      const n = Number(m[1]);
      if (n >= 2) return n;
    }
  }
  return undefined;
}

/** Normalize one Open Library search or trending doc. Returns undefined for unusable records. */
export function normalizeSearchDoc(raw: Json): Book | undefined {
  if (!isRecord(raw)) return undefined;
  const workId = str(raw.key)?.match(/OL\d+W/)?.[0];
  if (!workId) return undefined;

  const edition = firstEnglishEdition(raw);
  const editionLangs = edition ? strArray(edition.language) : [];
  const editionTitle = edition ? str(edition.title, 300) : undefined;
  const workTitle = str(raw.title, 300);
  // An edition title competes when the index labelled it English, or when the work title is in another
  // script and the edition at least offers something readable.
  const candidate = editionTitle && (editionLangs.includes("eng") || (workTitle && !isLatin(workTitle) && isLatin(editionTitle))) ? editionTitle : undefined;
  const title = pickDisplayTitle(workTitle, candidate);
  if (!title) return undefined;
  // The subtitle follows the title it belongs to: a work subtitle is in the work title's language.
  const subtitle = title === editionTitle ? str(edition?.subtitle, 300) ?? (title === workTitle ? str(raw.subtitle, 300) : undefined) : str(raw.subtitle, 300);

  const coverId = num(edition?.cover_i) ?? num(raw.cover_i);
  const validCover = coverId !== undefined && coverId > 0 ? coverId : undefined;

  const ratingAvg = num(raw.ratings_average);
  const ratingCount = num(raw.ratings_count);
  const want = num(raw.want_to_read_count) ?? 0;
  const read = num(raw.already_read_count) ?? 0;
  const pages = num(raw.number_of_pages_median);
  const authors = pickAuthorEntries(raw);
  const authorKeys = authors.length > 0 && authors.every((a) => a.key) ? authors.map((a) => a.key as string) : undefined;

  return {
    id: workId,
    title: tidyTitle(stripCatalogNote(title)),
    subtitle,
    authors: authors.map((a) => a.name),
    authorKeys,
    coverUrl: validCover ? olCoverUrl(validCover, "M") : undefined,
    coverUrlLarge: validCover ? olCoverUrl(validCover, "L") : undefined,
    publishedYear: year(raw.first_publish_year),
    publisher: edition ? strArray(edition.publisher)[0] : undefined,
    isbn: edition ? pickIsbn(strArray(edition.isbn)) : undefined,
    pageCount: pages && pages > 20 && pages < 5000 ? Math.round(pages) : undefined,
    subjects: uniq(strArray(raw.subject, 120)),
    categories: [],
    rating: ratingAvg !== undefined && ratingCount ? { average: Math.round(ratingAvg * 100) / 100, count: ratingCount } : undefined,
    readerCount: want + read || undefined,
    firstSentence: strArray(raw.first_sentence)[0],
    seriesVolume: volumeFromTitles([workTitle, editionTitle]),
    source: "openlibrary",
    sourceId: workId,
    sourceUrl: `${BASE}/works/${workId}`,
  };
}

/** Merge a work record into a search-derived book. */
export function applyWorkDetails(book: Book, work: OpenLibraryWorkDetails | undefined): Book {
  if (!work) return book;
  const coverId = book.coverUrl ? undefined : work.coverIds[0];
  return {
    ...book,
    description: book.description ?? work.description,
    subjects: uniq([...book.subjects, ...work.subjects]),
    firstSentence: book.firstSentence ?? work.firstSentence,
    coverUrl: book.coverUrl ?? (coverId ? olCoverUrl(coverId, "M") : undefined),
    coverUrlLarge: book.coverUrlLarge ?? (coverId ? olCoverUrl(coverId, "L") : undefined),
  };
}
