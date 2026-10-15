import { describe, expect, it } from "vitest";
import { laterVolume, rerank } from "@/lib/recommendations/rerank";
import { scoreBook } from "@/lib/recommendations/scoring";
import { buildSignals } from "@/lib/recommendations/preferenceMapper";
import { byTitle, CATALOG } from "./fixtures/books";
import { liked, prefs } from "./helpers";

describe("series handling", () => {
  it("recognizes later volumes from titles and descriptions", () => {
    expect(laterVolume("House Harkonnen (Dune: House Trilogy, Book 2)")).toBe(2);
    expect(laterVolume("Toll the Hounds (Malazan Book 8)")).toBe(8);
    expect(laterVolume("The Fellowship of the Ring")).toBeUndefined();
    expect(laterVolume("Mistborn: The Final Empire")).toBeUndefined();
    expect(laterVolume("Death's End", "The third book in the Remembrance of Earth's Past trilogy.")).toBe(2);
    expect(laterVolume("A Storm of Swords", "The third volume of A Song of Ice and Fire continues the story.")).toBe(2);
    expect(laterVolume("Dune", "A desert planet, political intrigue and prophecy.")).toBeUndefined();
  });

  it("excludes continuations of a liked book even when another author wrote them", () => {
    const s = buildSignals(prefs({ likedBooks: liked("Dune") }), [byTitle("Dune")]);
    const sandworms = { ...byTitle("Children of Dune"), id: "OL77777W", title: "Sandworms of Dune", authors: ["Kevin J. Anderson"], sourceId: "OL77777W" };
    const pool = [sandworms, byTitle("Foundation"), byTitle("Hyperion"), byTitle("The Left Hand of Darkness"), byTitle("A Memory Called Empire"), byTitle("The Dispossessed")].map((b) => scoreBook(b, s));
    const r = rerank(pool, { likedIds: [byTitle("Dune").id], likedTitles: ["Dune"], likedAuthors: ["frank herbert"] });
    expect(r.recommendations.map((sb) => sb.book.title)).not.toContain("Sandworms of Dune");
  });

  it("excludes a sequel whose subjects name the liked series", () => {
    const s = buildSignals(prefs({ likedBooks: liked("Mistborn: The Final Empire") }), [byTitle("Mistborn: The Final Empire")]);
    const sequel = { ...byTitle("Mistborn: The Final Empire"), id: "OL77778W", title: "The Well of Ascension", subjects: ["Fiction", "Fantasy", "Mistborn (Imaginary place)", "Magic"], sourceId: "OL77778W" };
    const pool = [sequel, byTitle("The Name of the Wind"), byTitle("The Way of Kings"), byTitle("Warbreaker"), byTitle("The Hobbit"), byTitle("Piranesi")].map((b) => scoreBook(b, s));
    const r = rerank(pool, { likedIds: [byTitle("Mistborn: The Final Empire").id], likedTitles: ["Mistborn: The Final Empire"], likedAuthors: ["brandon sanderson"] });
    const titles = r.recommendations.map((sb) => sb.book.title);
    expect(titles).not.toContain("The Well of Ascension");
    expect(titles.filter((t) => ["The Way of Kings", "Warbreaker", "Elantris"].includes(t)).length).toBeLessThanOrEqual(1);
  });

  it("keeps one book per author and shows the list in score order", () => {
    const s = buildSignals(prefs({ genres: ["fantasy"] }), []);
    const pool = CATALOG.map((b) => scoreBook(b, s));
    const r = rerank(pool, { likedIds: [], likedTitles: [], likedAuthors: [] });
    const authors = r.recommendations.map((sb) => sb.book.authors[0]);
    expect(new Set(authors).size).toBe(authors.length);
    for (let i = 1; i < r.recommendations.length; i++) expect(r.recommendations[i - 1].score).toBeGreaterThanOrEqual(r.recommendations[i].score);
  });
});
