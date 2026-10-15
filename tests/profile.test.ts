import { describe, expect, it } from "vitest";
import { buildSignals, extractReferences, inferLatentTags, parseFreeText, toLikedProfile } from "@/lib/recommendations/preferenceMapper";
import { planRetrieval } from "@/lib/recommendations/retrieval";
import { byTitle } from "./fixtures/books";
import { liked, prefs } from "./helpers";

describe("free-text understanding", () => {
  it("extracts concepts, negatives and references instead of one keyword query", () => {
    const parsed = parseFreeText("I want something like Black Mirror but more philosophical and less depressing.");
    expect(parsed.references).toContain("Black Mirror");
    expect(parsed.tags.technology).toBeGreaterThan(0.5);
    expect(parsed.tags.dystopian).toBeGreaterThan(0.5);
    expect(parsed.tags.philosophy).toBeGreaterThan(0.5);
    expect(parsed.avoidTags.dark).toBeGreaterThan(0.5);
    expect(parsed.experience.darkness).toBeLessThan(0.5);
    // the reference is not also chased as loose keywords
    expect(parsed.terms).not.toContain("black");
  });

  it("marks stressed refusals as hard constraints", () => {
    const parsed = parseFreeText("Absolutely no romance. Something fast-paced please.");
    expect(parsed.hardAvoidTags.romance).toBeGreaterThan(0.8);
    expect(parsed.experience.pace).toBeGreaterThan(0.6);
  });

  it("recognizes several reference phrasings", () => {
    expect(extractReferences("something similar to The Martian, in the vein of Project Hail Mary")).toEqual(["The Martian", "Project Hail Mary"]);
    expect(extractReferences('I loved "Station Eleven"')).toEqual(["Station Eleven"]);
  });
});

describe("derived reader profile", () => {
  it("infers latent tastes shared across liked books", () => {
    const profiles = ["Dune", "Harry Potter and the Philosopher's Stone", "The Martian"].map((t) => toLikedProfile(byTitle(t), "liked", 1));
    const latent = inferLatentTags(profiles);
    // Not the intersection of three genres, but what they share: imaginative worlds, adventure, science.
    expect((latent.worldbuilding ?? 0) + (latent.space ?? 0) + (latent.scifi ?? 0)).toBeGreaterThan(0.8);
    expect(latent.survival ?? 0).toBeGreaterThan(0.2);
    expect(latent.romance ?? 0).toBeLessThan(0.2);
  });

  it("separates hard constraints from soft preferences", () => {
    const s = buildSignals(prefs({ genres: ["science-fiction"], dislikedThemes: ["horror", "too-slow"], readingLength: "quick" }), []);
    expect(s.hard.excludeTags.map((e) => e.tag)).toContain("horror");
    expect(s.hard.excludeTags.map((e) => e.tag)).not.toContain("classics");
    expect(s.avoidSlow).toBe(true);
    expect(s.hard.maxPages).toBeGreaterThan(300);
    expect(s.priorities.genreMatch).toBe("veryImportant");
  });

  it("represents contradictory answers and resolves toward the stronger one", () => {
    const s = buildSignals(prefs({ emotionalIntensity: "devastating", dislikedThemes: ["depressing"] }), []);
    expect(s.conflicts.length).toBe(1);
    expect(s.darkness?.target).toBeCloseTo(0.5, 1);
    expect(s.conflicts[0].resolution).toMatch(/bittersweet/);
  });

  it("writes a semantic profile without negatives", () => {
    const s = buildSignals(prefs({ moods: ["think"], genres: ["science-fiction"], likedBooks: liked("Dune"), freeText: "fast and thought-provoking, no romance" }), [byTitle("Dune")]);
    expect(s.semanticProfileText).toMatch(/Reader wants/);
    expect(s.semanticProfileText).toMatch(/Dune/);
    expect(s.semanticProfileText).not.toMatch(/romance/);
    expect(s.negativeConcepts).toContain("romance");
  });

  it("infers pace and complexity from favorites only when the reader did not say", () => {
    const s = buildSignals(prefs({ likedBooks: liked("Gone Girl", "The Silent Patient") }), [byTitle("Gone Girl"), byTitle("The Silent Patient")]);
    expect(s.pace?.inferred).toBe(true);
    expect(s.pace!.target).toBeGreaterThan(0.6);
    const explicit = buildSignals(prefs({ pace: "slow", likedBooks: liked("Gone Girl") }), [byTitle("Gone Girl")]);
    expect(explicit.pace?.inferred).toBeFalsy();
    expect(explicit.pace!.target).toBeLessThan(0.3);
  });
});

describe("retrieval planner", () => {
  it("generates several routes rather than one profile-wide query", () => {
    const s = buildSignals(prefs({ moods: ["think"], genres: ["science-fiction"], likedBooks: liked("Dune"), freeText: "political intrigue and ecology" }), [byTitle("Dune")]);
    const plan = planRetrieval(s);
    const routes = new Set(plan.map((q) => q.route));
    expect(routes.has("genre")).toBe(true);
    expect(routes.has("liked")).toBe(true);
    expect(routes.has("exploration")).toBe(true);
    expect(plan.length).toBeGreaterThanOrEqual(5);
    expect(plan.length).toBeLessThanOrEqual(12);
    // excluded genres are pushed into the query itself
    const withAvoid = planRetrieval(buildSignals(prefs({ genres: ["science-fiction"], dislikedThemes: ["horror"] }), []));
    expect(withAvoid.every((q) => q.q.includes('NOT subject:"horror"'))).toBe(true);
  });

  it("explores adjacent concepts, not random ones", () => {
    const s = buildSignals(prefs({ genres: ["science-fiction"] }), []);
    const exploration = planRetrieval(s).filter((q) => q.route === "exploration");
    expect(exploration.length).toBeGreaterThan(0);
    expect(exploration[0].q).toMatch(/dystopias|philosophy|artificial intelligence|social problems|political fiction/);
    expect(exploration[0].q).not.toMatch(/romance|love stories/);
  });
});
