import { describe, expect, it } from "vitest";
import {
  applyEnglishEdition,
  conventionalSpelling,
  normalizeSearchDoc,
  pickAuthor,
  pickDisplayTitle,
  pickEnglishEditionTitle,
  stripCatalogNote,
  titleEnglishness,
} from "@/lib/api/openLibrary";

/** A search.json doc the way Open Library returns it: a work titled in the original language, one edition sub-document. */
const coffeeDoc = {
  key: "/works/OL20019347W",
  title: "Antes de que se enfríe el café",
  subtitle: "Una novela",
  author_name: ["川口俊和", "Toshikazu Kawaguchi"],
  author_alternative_name: ["Kawaguchi, Toshikazu", "Toshikazu Kawaguchi", "かわぐち としかず", "川口, 俊和"],
  first_publish_year: 2015,
  cover_i: 101,
  number_of_pages_median: 224,
  ratings_average: 3.7,
  ratings_count: 120,
  want_to_read_count: 900,
  subject: ["Time travel", "Cafés", "Fiction"],
  language: ["spa", "eng", "jpn"],
  editions: {
    numFound: 12,
    docs: [{ key: "/books/OL28203220M", title: "Before the Coffee Gets Cold", language: ["eng"], cover_i: 202, isbn: ["9781529029581"], publisher: ["Picador"] }],
  },
};

describe("normalizeSearchDoc title selection", () => {
  it("prefers the English edition title over a foreign work title", () => {
    const book = normalizeSearchDoc(coffeeDoc)!;
    expect(book.title).toBe("Before the Coffee Gets Cold");
    expect(book.subtitle).toBeUndefined();
    expect(book.authors).toEqual(["Toshikazu Kawaguchi"]);
    expect(book.isbn).toBe("9781529029581");
    expect(book.coverUrl).toContain("202");
  });

  it("keeps an English work title when the edition labelled English is a mislabelled translation", () => {
    const book = normalizeSearchDoc({
      key: "/works/OL14911626W",
      title: "Anathem",
      author_name: ["Neal Stephenson"],
      language: ["tur", "ger", "eng"],
      editions: { numFound: 18, docs: [{ key: "/books/OL26280310M", title: "Anatema", language: ["eng"] }] },
    })!;
    expect(book.title).toBe("Anathem");
    expect(book.authors).toEqual(["Neal Stephenson"]);
  });

  it("falls back to any Latin-script edition title when the work title is in another script", () => {
    const book = normalizeSearchDoc({
      key: "/works/OL1W",
      title: "コーヒーが冷めないうちに",
      author_name: ["川口俊和"],
      editions: { numFound: 1, docs: [{ key: "/books/OL1M", title: "Coffee Ga Samenai Uchi Ni", language: ["jpn"] }] },
    })!;
    expect(book.title).toBe("Coffee Ga Samenai Uchi Ni");
  });

  it("drops a trailing catalog note from the display title but keeps the volume it named", () => {
    const book = normalizeSearchDoc({
      key: "/works/OL731644W",
      title: "Atlas Shrugged (Centennial Ed. HC)",
      author_name: ["Ayn Rand"],
      editions: { numFound: 1, docs: [{ key: "/books/OL3M", title: "Atlas Shrugged (Centennial Ed. HC)", language: ["eng"] }] },
    })!;
    expect(book.title).toBe("Atlas Shrugged");
    const sequel = normalizeSearchDoc({ key: "/works/OL4W", title: "Death's End (The Three-Body Problem Series Book 3)", author_name: ["Liu Cixin"] })!;
    expect(sequel.title).toBe("Death's End");
    expect(sequel.seriesVolume).toBe(3);
    expect(stripCatalogNote("Eats, Shoots & Leaves (and Other Stories)")).toBe("Eats, Shoots & Leaves (and Other Stories)");
    expect(stripCatalogNote("(Un)Natural")).toBe("(Un)Natural");
  });

  it("still reads the series volume from whichever title carries it", () => {
    const book = normalizeSearchDoc({
      key: "/works/OL2W",
      title: "Dune Messiah",
      author_name: ["Frank Herbert"],
      editions: { numFound: 3, docs: [{ key: "/books/OL2M", title: "Dune Messiah (Dune Chronicles, Book 2)", language: ["eng"] }] },
    })!;
    expect(book.title).toBe("Dune Messiah");
    expect(book.seriesVolume).toBe(2);
  });
});

describe("pickDisplayTitle / titleEnglishness", () => {
  it("scores English function words up and other languages' down", () => {
    expect(titleEnglishness("One Hundred Years of Solitude")).toBeGreaterThan(titleEnglishness("Cien años de soledad"));
    expect(titleEnglishness("The Little Prince")).toBeGreaterThan(titleEnglishness("Le Petit Prince"));
    expect(titleEnglishness("Der Vorleser")).toBeLessThan(0);
    expect(titleEnglishness("ノルウェイの森")).toBe(Number.NEGATIVE_INFINITY);
  });

  it("lets the English title win and the work title keep a tie", () => {
    expect(pickDisplayTitle("Cien años de soledad", "One Hundred Years of Solitude")).toBe("One Hundred Years of Solitude");
    expect(pickDisplayTitle("The Name of the Wind", "El nombre del viento")).toBe("The Name of the Wind");
    expect(pickDisplayTitle("Anathem", "Anatema")).toBe("Anathem");
    expect(pickDisplayTitle("ノルウェイの森", "Norwegian Wood")).toBe("Norwegian Wood");
    expect(pickDisplayTitle(undefined, "Solaris")).toBe("Solaris");
    expect(pickDisplayTitle("Solaris", undefined)).toBe("Solaris");
  });
});

describe("pickEnglishEditionTitle", () => {
  const eng = { key: "/languages/eng" };
  const entries = [
    { title: "Anathem", languages: [eng] },
    { title: "ANATHEM", languages: [eng] },
    { title: "Anathem (Annotated)", languages: [eng] },
    { title: "Anatema", languages: [eng] },
    { title: "Anathem", languages: [{ key: "/languages/ger" }] },
    { title: "Anathem", languages: [{ key: "/languages/tur" }], subtitle: "Roman" },
    { title: "Anathem: A Novel", languages: [eng] },
  ];

  it("returns the title most English-labelled editions share, with a readable capitalisation", () => {
    expect(pickEnglishEditionTitle(entries)).toEqual({ title: "Anathem", subtitle: undefined, votes: 3 });
  });

  it("ignores editions that are not labelled English, and works without any", () => {
    expect(pickEnglishEditionTitle(entries.filter((e) => e.languages[0] !== eng))).toBeUndefined();
    expect(pickEnglishEditionTitle([])).toBeUndefined();
    expect(pickEnglishEditionTitle([{ title: "Записки из подполья", languages: [eng] }])).toBeUndefined();
  });

  it("restores the leading article that library cataloguing drops", () => {
    const dispossessed = [
      { title: "Dispossessed", languages: [eng] },
      { title: "Dispossessed", languages: [eng] },
      { title: "Dispossessed", languages: [eng] },
      { title: "The Dispossessed", languages: [eng] },
      { title: "Dispossessed, the [50th Anniversary Edition]", languages: [eng] },
      { title: "The  dispossessed", languages: [eng] },
    ];
    expect(pickEnglishEditionTitle(dispossessed)).toEqual({ title: "The Dispossessed", subtitle: undefined, votes: 6 });
  });

  it("prefers the most frequent spelling of the winning title", () => {
    const heavens = [
      { title: "Heaven’s River", languages: [eng] },
      { title: "Heaven’s River", languages: [eng] },
      { title: "Heaven's River", languages: [eng] },
    ];
    expect(pickEnglishEditionTitle(heavens)?.title).toBe("Heaven’s River");
  });

  it("keeps a subtitle only when at least half of the winning editions carry it", () => {
    const withSubtitle = [
      { title: "Mistborn", subtitle: "The Final Empire", languages: [eng] },
      { title: "Mistborn", subtitle: "The Final Empire", languages: [eng] },
      { title: "Mistborn", languages: [eng] },
    ];
    expect(pickEnglishEditionTitle(withSubtitle)).toEqual({ title: "Mistborn", subtitle: "The Final Empire", votes: 3 });
  });
});

describe("applyEnglishEdition", () => {
  const base = normalizeSearchDoc({
    key: "/works/OL20019347W",
    title: "コーヒーが冷めないうちに",
    subtitle: "小説",
    author_name: ["川口俊和"],
    editions: { numFound: 24, docs: [{ key: "/books/OL61427352M", title: "Coffee Ga Samenai Uchi Ni", language: ["eng"] }] },
  })!;

  it("replaces a romanised or translated title with the one the English editions share", () => {
    const book = applyEnglishEdition(base, { title: "Before the Coffee Gets Cold", votes: 6 });
    expect(book.title).toBe("Before the Coffee Gets Cold");
    expect(book.subtitle).toBeUndefined();
    expect(book.id).toBe("OL20019347W");
  });

  it("leaves the record alone when the title already matches, or when the evidence is a single edition", () => {
    const same = { ...base, title: "Before the Coffee Gets Cold" };
    expect(applyEnglishEdition(same, { title: "Before the coffee gets cold", votes: 1 })).toBe(same);
    expect(applyEnglishEdition(same, undefined)).toBe(same);
    const english = { ...base, title: "The Name of the Wind" };
    expect(applyEnglishEdition(english, { title: "El nombre del viento", votes: 1 })).toBe(english);
    const google = { ...base, source: "googlebooks" as const };
    expect(applyEnglishEdition(google, { title: "Before the Coffee Gets Cold", votes: 6 })).toBe(google);
  });

  it("adopts the editions' form of an otherwise identical title", () => {
    const guessed = { ...base, title: "Notes From the Underground" };
    expect(applyEnglishEdition(guessed, { title: "Notes from the Underground", votes: 20 }).title).toBe("Notes from the Underground");
    const junk = { ...base, title: "Atlas Shrugged (Centennial Ed. HC)" };
    expect(applyEnglishEdition(junk, { title: "Atlas Shrugged", votes: 21 }).title).toBe("Atlas Shrugged");
  });

  it("keeps the work title's leading article when the editions merely dropped it", () => {
    const withArticle = { ...base, title: "The Dispossessed" };
    expect(applyEnglishEdition(withArticle, { title: "Dispossessed", subtitle: "An Ambiguous Utopia", votes: 7 })).toBe(withArticle);
  });
});

describe("author spelling", () => {
  const dostoevskyAliases = [
    "Fyodor Dostoevsky",
    "F. M. Dostoevsky",
    "Fyodor Mikhailovich Dostoevsky",
    "Dostoevsky, Fyodor",
    "Fyodor Dostoyevsky",
    "Fiodor Dostoievski",
    "Фёдор Достоевский",
    "Fédor Dostoïevski",
    "Constance Garnett",
  ];

  it("lets the aliases vote a local transliteration down to the conventional spelling", () => {
    expect(pickAuthor({ author_name: ["Fiódor Dostoievski"], author_alternative_name: dostoevskyAliases })).toEqual(["Fyodor Dostoevsky"]);
  });

  it("picks a Latin spelling for a name in another script", () => {
    expect(pickAuthor({ author_name: ["村上春樹"], author_alternative_name: ["村上, 春樹", "Murakami, Haruki", "Haruki Murakami", "HARUKI MURAKAMI"] })).toEqual(["Haruki Murakami"]);
    expect(normalizeSearchDoc(coffeeDoc)!.authors).toEqual(["Toshikazu Kawaguchi"]);
  });

  it("never second-guesses a plain ASCII name, and keeps accents the aliases agree on", () => {
    expect(conventionalSpelling("Neal Stephenson", ["Stephen Bury", "Neal Town Stephenson", "NEAL STEPHENSON", "N. Stephenson"])).toBe("Neal Stephenson");
    expect(conventionalSpelling("José Saramago", ["Jose Saramago", "Saramago, José", "José de Sousa Saramago"])).toBe("José Saramago");
    expect(conventionalSpelling("Gabriel García Márquez", ["Gabriel Garcia Marquez", "Gabo", "García Márquez, Gabriel"])).toBe("Gabriel García Márquez");
  });

  it("does not hand an author's slot to a co-author's spelling", () => {
    expect(pickAuthor({ author_name: ["Fiódor Dostoievski", "Constance Garnett"], author_alternative_name: ["Garnett, Constance", "Constance Garnett", "Fyodor Dostoevsky", "Dostoevsky, Fyodor"] })).toEqual([
      "Fyodor Dostoevsky",
      "Constance Garnett",
    ]);
  });

  it("tidies shouting names", () => {
    expect(pickAuthor({ author_name: ["NEAL STEPHENSON"] })).toEqual(["Neal Stephenson"]);
    expect(pickAuthor({ author_name: ["Kawaguchi, Toshikazu"] })).toEqual(["Toshikazu Kawaguchi"]);
  });
});
