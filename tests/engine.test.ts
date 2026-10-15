import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "@/lib/recommendations/config";
import { applyFeedback, selectRecommendations } from "@/lib/recommendations/select";
import { byTitle, CATALOG } from "./fixtures/books";
import { authors, candidate, cluster, fakeEmbedder, liked, run, titles } from "./helpers";

const SCIFI_TAGS = ["scifi", "space", "worldbuilding", "dystopian", "ai"] as const;

describe("Profile A: science fiction, fast, thought-provoking, liked Dune + Project Hail Mary, no romance", () => {
  const p = { genres: ["science-fiction" as const], moods: ["think" as const], pace: "fast" as const, likedBooks: liked("Dune", "Project Hail Mary"), dislikedThemes: ["romance" as const] };

  it("returns sensible, diverse science fiction and never the liked books or their sequels", async () => {
    const r = await run(p);
    const t = titles(r);
    expect(r.engineVersion).toBe(ENGINE_VERSION);
    expect(r.recommendations.length).toBeGreaterThanOrEqual(5);
    expect(t).not.toContain("Dune");
    expect(t).not.toContain("Dune Messiah");
    expect(t).not.toContain("Children of Dune");
    expect(t).not.toContain("Project Hail Mary");
    for (const sb of r.recommendations) {
      const scifiish = SCIFI_TAGS.some((tag) => (sb.profile.tags[tag] ?? 0) >= 0.5) || sb.novelty! >= 0.5;
      expect(scifiish, `${sb.book.title} should be science fiction or a deliberate exploration pick`).toBe(true);
    }
    expect(new Set(authors(r)).size).toBe(r.recommendations.length);
  });

  it("pushes romance out of the ranking rather than nudging it", async () => {
    const r = await run(p);
    expect(titles(r)).not.toContain("The Time Traveler's Wife");
    const ttw = candidate(r, "The Time Traveler's Wife");
    expect(ttw.filtered ?? "soft").toMatch(/romance|soft/);
    if (!ttw.filtered) expect(ttw.final).toBeLessThan(r.recommendations[r.recommendations.length - 1].score);
  });

  it("explains every pick from real signals and reports a confidence", async () => {
    const r = await run(p);
    expect(r.confidenceScore).toBeGreaterThan(0.4);
    for (const sb of r.recommendations) {
      expect(sb.explanation).toBeDefined();
      expect(sb.explanation!.strongestMatches.length).toBeGreaterThan(0);
      for (const m of sb.explanation!.strongestMatches) expect(m.strength).toBeGreaterThan(0);
      expect(sb.role).toBeDefined();
      expect(sb.confidence).toBeGreaterThan(0);
    }
    expect(r.recommendations[0].role).toBe("perfect");
    expect(r.profileSummary).toMatch(/Dune/);
    expect(r.profileSummary).toMatch(/science fiction|space|world/i);
  });
});

describe("Profile B: cozy, emotional, romance, short, easy", () => {
  it("prefers warm, short, accessible books and keeps horror and dark literary fiction out", async () => {
    const r = await run({ moods: ["cozy", "emotional"], genres: ["romance"], readingLength: "quick", complexity: "easy" });
    const t = titles(r);
    expect(r.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(t).not.toContain("The Shining");
    expect(t).not.toContain("A Little Life");
    expect(t).not.toContain("The Road");
    for (const sb of r.recommendations) {
      const warm = (sb.profile.tags.cozy ?? 0) + (sb.profile.tags.romance ?? 0) + (sb.profile.tags.love ?? 0) + (sb.profile.tags.humor ?? 0) + (sb.profile.tags.emotional ?? 0);
      expect(warm, `${sb.book.title} should feel warm`).toBeGreaterThan(0.5);
      if (sb.book.pageCount) expect(sb.book.pageCount).toBeLessThan(420);
    }
    // long books are hard-filtered when a quick read was requested
    expect(candidate(r, "It").filtered).toMatch(/longer/);
  });
});

describe("Profile C: psychological, disturbing, mystery, complex, dark", () => {
  it("surfaces dark psychological mysteries, not cozy or children's books", async () => {
    const r = await run({ moods: ["uncomfortable", "hooked"], genres: ["mystery", "thriller"], complexity: "challenging", endingPreference: "dark" });
    const t = titles(r);
    expect(r.recommendations.length).toBeGreaterThanOrEqual(4);
    expect(t).not.toContain("Legends & Lattes");
    expect(t).not.toContain("Matilda");
    expect(t).not.toContain("Charlotte's Web");
    const dark = r.recommendations.filter((sb) => sb.profile.darkness.value > 0.5 || (sb.profile.tags.mystery ?? 0) > 0.5 || (sb.profile.tags.thriller ?? 0) > 0.5);
    expect(dark.length).toBeGreaterThanOrEqual(Math.ceil(r.recommendations.length * 0.8));
  });
});

describe("Profile D: self-improvement, psychology, business, non-fiction", () => {
  it("returns non-fiction and penalizes novels", async () => {
    const r = await run({ moods: ["grow"], genres: ["psychology", "business", "self-help"], goals: ["motivation", "myself"] });
    expect(r.recommendations.length).toBeGreaterThanOrEqual(5);
    for (const sb of r.recommendations) expect(sb.profile.isFiction, `${sb.book.title} should be non-fiction`).toBe(false);
    expect(titles(r)).not.toContain("Dune");
    expect(new Set(authors(r)).size).toBe(r.recommendations.length);
  });
});

describe("Profile E: no preferences", () => {
  it("falls back to widely loved books, labelled as broad with low confidence", async () => {
    const r = await run({});
    expect(r.mode).toBe("broad");
    expect(r.confidence).toBe("low");
    expect(r.confidenceScore).toBeLessThanOrEqual(0.3);
    expect(r.recommendations.length).toBeGreaterThan(0);
    expect(titles(r)).not.toContain("Starlight Colony");
    expect(r.summary).toMatch(/didn't set any preferences/);
  });
});

describe("negative preferences", () => {
  it("eliminates books strongly associated with an avoided genre and penalizes the rest", async () => {
    const r = await run({ genres: ["science-fiction"], dislikedThemes: ["horror"] });
    const t = titles(r);
    expect(t).not.toContain("The Shining");
    expect(t).not.toContain("Bird Box");
    expect(candidate(r, "The Shining").filtered).toMatch(/horror/);
    // Annihilation is science fiction with horror in its subjects: allowed, but held back.
    const annihilation = candidate(r, "Annihilation");
    if (!annihilation.filtered) expect(annihilation.penaltyMultiplier).toBeLessThan(0.75);
  });

  it("treats a free-text refusal like an avoid answer", async () => {
    const r = await run({ genres: ["science-fiction"], freeText: "absolutely no romance" });
    expect(titles(r)).not.toContain("The Time Traveler's Wife");
    expect(candidate(r, "The Time Traveler's Wife").filtered).toMatch(/romance/);
  });

  it("uses the avoid box terms against catalog subjects", async () => {
    const r = await run({ genres: ["science-fiction"], avoidText: "vampires, cannibalism" });
    const blindsight = candidate(r, "Blindsight");
    expect(blindsight.penaltyMultiplier).toBeLessThan(0.6);
    expect(titles(r)).not.toContain("Tender Is the Flesh");
  });
});

describe("diversity", () => {
  it("spreads a list across authors and conceptual clusters when a dominant author and series exist", async () => {
    const r = await run({ genres: ["fantasy"], moods: ["escape"], likedBooks: liked("Mistborn: The Final Empire") });
    const a = authors(r);
    expect(a.filter((x) => x === "Brandon Sanderson").length).toBeLessThanOrEqual(1);
    expect(new Set(a).size).toBe(a.length);
    expect(r.recommendations.length).toBeGreaterThanOrEqual(5);
  });

  it("does not return five near-identical space operas; MMR and exploration add different flavors", async () => {
    const r = await run({ genres: ["science-fiction"], moods: ["escape"] });
    const picks = r.recommendations.slice(0, 6);
    const clusters = new Set(picks.map((sb) => `${cluster(sb)}:${[...Object.entries(sb.profile.tags)].filter(([k, v]) => v >= 0.6 && k !== "scifi").map(([k]) => k).sort().slice(0, 2).join("+")}`));
    expect(clusters.size).toBeGreaterThanOrEqual(3);
    const roles = new Set(picks.map((sb) => sb.role));
    expect(roles.size).toBeGreaterThanOrEqual(3);
    expect(r.similarity?.ids.length).toBeGreaterThan(0);
  });

  it("drops near-duplicate editions before scoring", async () => {
    const dup = { ...byTitle("Foundation"), id: "OL99999W", title: "Foundation (Foundation, #1)", sourceId: "OL99999W", isbn: undefined };
    const r = await run({ genres: ["science-fiction"] }, { catalog: [...CATALOG, dup] });
    const t = titles(r);
    expect(t.filter((x) => /^Foundation/.test(x)).length).toBeLessThanOrEqual(1);
  });
});

describe("liked-book similarity", () => {
  it("recommends books that share Dune's characteristics, not just Frank Herbert", async () => {
    const r = await run({ likedBooks: liked("Dune") });
    const t = titles(r);
    expect(t).not.toContain("Dune");
    expect(t).not.toContain("Dune Messiah");
    expect(authors(r)).not.toContain("Frank Herbert");
    const top = r.recommendations.slice(0, 4);
    for (const sb of top) {
      const political = (sb.profile.tags.politics ?? 0) + (sb.profile.tags.worldbuilding ?? 0) + (sb.profile.tags.scifi ?? 0) + (sb.profile.tags.space ?? 0);
      expect(political, `${sb.book.title} should share Dune's traits`).toBeGreaterThan(0.8);
    }
    expect(t.slice(0, 4)).toEqual(expect.arrayContaining([expect.stringMatching(/Foundation|A Memory Called Empire|The Left Hand of Darkness|The Dispossessed|Hyperion|The Quiet Orbit/)]));
  });

  it("changes the profile when The Martian is added", async () => {
    const dune = await run({ likedBooks: liked("Dune") });
    const both = await run({ likedBooks: liked("Dune", "The Martian") });
    expect(titles(both)).not.toEqual(titles(dune));
    const survivalScience = (r: typeof both) => r.recommendations.slice(0, 5).reduce((a, sb) => a + (sb.profile.tags.survival ?? 0) + (sb.profile.tags.science ?? 0) + (sb.profile.tags.humor ?? 0), 0);
    expect(survivalScience(both)).toBeGreaterThan(survivalScience(dune));
    expect(titles(both).slice(0, 6)).toEqual(expect.arrayContaining([expect.stringMatching(/Project Hail Mary|Seveneves|Children of Time|The Three-Body Problem/)]));
  });

  it("does not let one favorite dominate when several are given", async () => {
    const r = await run({ likedBooks: liked("Dune", "Harry Potter and the Philosopher's Stone", "The Martian") });
    const t = titles(r).slice(0, 6);
    const scifi = t.filter((x) => (byTitle(x).subjects.join(" ").match(/Science fiction/) ?? []).length > 0).length;
    const fantasy = t.filter((x) => /Fantasy/.test(byTitle(x).subjects.join(" "))).length;
    expect(scifi).toBeGreaterThan(0);
    expect(fantasy).toBeGreaterThan(0);
  });
});

describe("free text", () => {
  it("turns 'like Black Mirror but more philosophical and less depressing' into concepts", async () => {
    const r = await run({ freeText: "I want something like Black Mirror but more philosophical and less depressing." });
    const t = titles(r);
    expect(r.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(t.slice(0, 5)).toEqual(expect.arrayContaining([expect.stringMatching(/Exhalation|Stories of Your Life|Brave New World|Klara and the Sun|Anathem|Nineteen Eighty-Four|Snow Crash/)]));
    // bleak books are held back by the "less depressing" clause
    expect(t.slice(0, 5)).not.toContain("The Road");
    expect(t.slice(0, 5)).not.toContain("Tender Is the Flesh");
    expect(r.chips.some((c) => c.kind === "freeText") || r.recommendations[0].reasons.some((x) => x.kind === "freeText")).toBe(true);
  });

  it("uses a resolved reference book as a liked-book signal", async () => {
    const r = await run({ freeText: "something like The Martian" }, { signalOptions: { references: [byTitle("The Martian")] } });
    expect(titles(r)).not.toContain("The Martian");
    expect(titles(r).slice(0, 4)).toEqual(expect.arrayContaining([expect.stringMatching(/Project Hail Mary|Seveneves|Children of Time/)]));
    expect(r.chips.some((c) => c.label === "Like The Martian")).toBe(true);
  });
});

describe("semantic layer", () => {
  it("uses embeddings when an embedder is available and keeps working without one", async () => {
    const p = { moods: ["think" as const], genres: ["science-fiction" as const], likedBooks: liked("Dune") };
    const withEmb = await run(p, { embedder: fakeEmbedder });
    const without = await run(p);
    expect(withEmb.semantic).toBe(true);
    expect(without.semantic).toBe(false);
    expect(withEmb.recommendations[0].components.semantic).toBeDefined();
    expect(without.recommendations[0].components.semantic).toBeUndefined();
    expect(withEmb.recommendations.length).toBeGreaterThanOrEqual(5);
    expect(without.recommendations.length).toBeGreaterThanOrEqual(5);
    for (const sb of [...withEmb.recommendations, ...without.recommendations]) {
      for (const v of Object.values(sb.components)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("survives an embedder that throws", async () => {
    const broken = { model: "broken", embed: async () => { throw new Error("no model"); } };
    const r = await run({ genres: ["science-fiction"] }, { embedder: broken });
    expect(r.semantic).toBe(false);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });
});

describe("feedback loop and more-like-this", () => {
  it("'Not for me: too slow' pushes slow literary books down and re-diversifies", async () => {
    const r = await run({ moods: ["think"], genres: ["literary-fiction", "science-fiction"] });
    const pool = [...r.recommendations, ...r.reserve];
    const slow = pool.find((sb) => sb.profile.pace.value < 0.4 && sb.profile.pace.confidence > 0.3)!;
    const adjusted = applyFeedback(pool, [{ scored: slow, reason: "too-slow" }]);
    const again = selectRecommendations(adjusted, { likedIds: [], likedTitles: [], likedAuthors: [], similarity: r.similarity });
    expect(titles(again.recommendations)).not.toContain(slow.book.title);
    const slowOnes = adjusted.filter((sb) => sb.profile.pace.value < 0.4 && sb.profile.pace.confidence > 0.3);
    for (const sb of slowOnes) expect(sb.penalties.join(" ")).toMatch(/feedback/);
    expect(again.recommendations.every((sb) => sb.role)).toBe(true);
  });

  it("session rejections are hard-excluded on the next request", async () => {
    const first = await run({ genres: ["science-fiction"] });
    const rejectedId = first.recommendations[0].book.id;
    const second = await run({ genres: ["science-fiction"] }, { signalOptions: { session: { rejected: [{ bookId: rejectedId, reason: "wrong-genre" }] } } });
    expect(second.recommendations.map((sb) => sb.book.id)).not.toContain(rejectedId);
  });

  it("'more like this' keeps 40% of the original profile", async () => {
    const focusOnly = await run({}, { signalOptions: { focus: byTitle("Gone Girl") }, explorationShare: 0 });
    const blended = await run({ moods: ["think"], genres: ["science-fiction"] }, { signalOptions: { focus: byTitle("Gone Girl") }, explorationShare: 0 });
    expect(titles(focusOnly)).not.toContain("Gone Girl");
    expect(titles(focusOnly).slice(0, 3)).toEqual(expect.arrayContaining([expect.stringMatching(/Sharp Objects|The Silent Patient|Shutter Island|Misery/)]));
    // with a science-fiction profile in the mix, a thriller that is also science fiction climbs
    const dm = (r: typeof blended) => titles(r).indexOf("Dark Matter");
    expect(dm(blended) === -1 ? 99 : dm(blended)).toBeLessThan(dm(focusOnly) === -1 ? 99 : dm(focusOnly));
  });
});

describe("quality and metadata", () => {
  it("penalizes poor metadata without eliminating good books over one missing field", async () => {
    const r = await run({ genres: ["science-fiction"], moods: ["think"] });
    const thin = candidate(r, "Starlight Colony");
    const rich = candidate(r, "The Quiet Orbit");
    expect(thin.components.metadataQuality!).toBeLessThan(0.5);
    expect(rich.final).toBeGreaterThan(thin.final);
    expect(rich.components.metadataQuality!).toBeGreaterThan(0.9);
  });

  it("only calls a book a hidden gem when the data supports low popularity and a strong match", async () => {
    const r = await run({ likedBooks: liked("Dune") });
    const gem = r.recommendations.find((sb) => sb.role === "hiddenGem");
    if (gem) {
      expect(gem.popularityPercentile!).toBeLessThanOrEqual(0.35);
      expect(gem.score).toBeGreaterThanOrEqual(r.recommendations[0].score * 0.85);
    }
    expect(r.recommendations.filter((sb) => sb.role === "hiddenGem").length).toBeLessThanOrEqual(1);
  });

  it("reports score separation honestly", async () => {
    const r = await run({ genres: ["science-fiction"] });
    const [a, b] = r.recommendations;
    expect(r.clearWinner).toBe(a.score - b.score >= 0.06);
    if (!r.clearWinner) expect(r.profileSummary).toMatch(/close together/);
  });
});
