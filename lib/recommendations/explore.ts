import "server-only";
import { EMPTY_PREFERENCES, type Preferences } from "@/types/preferences";
import { getOpenLibraryTrending } from "@/lib/api/openLibrary";
import { enrichBooks, isUsableBook } from "@/lib/api/bookSearch";
import { memo } from "@/lib/api/http";
import { recommend } from "./recommendationEngine";
import { buildSignals } from "./preferenceMapper";
import { scoreBook } from "./scoring";
import type { ScoredBook, Signals } from "./types";

export type ExploreSectionId = "trending" | "think" | "hidden-gems" | "short" | "lost";

export interface ExploreSection {
  id: ExploreSectionId;
  title: string;
  blurb: string;
  books: ScoredBook[];
}

interface SectionDef {
  title: string;
  blurb: string;
  prefs?: Partial<Preferences>;
  qualityMode?: Signals["qualityMode"];
}

export const SECTION_DEFS: Record<ExploreSectionId, SectionDef> = {
  trending: { title: "Trending discoveries", blurb: "What Open Library readers are adding to their shelves this week." },
  think: { title: "Books that make you think", blurb: "Ideas, arguments and stories that keep working on you afterward.", prefs: { moods: ["think"], goals: ["perspective"] } },
  "hidden-gems": {
    title: "Hidden gems",
    blurb: "Highly rated by the readers who found them, and not yet everywhere.",
    prefs: { moods: ["emotional", "escape"] },
    qualityMode: "hidden",
  },
  short: { title: "Short but unforgettable", blurb: "Under two hundred pages, and worth every one.", prefs: { moods: ["emotional", "think"], readingLength: "quick" } },
  lost: { title: "Books worth getting lost in", blurb: "Big, immersive worlds for long evenings.", prefs: { moods: ["escape"], readingLength: "huge", goals: ["new-world"] } },
};

export function isSectionId(id: string): id is ExploreSectionId {
  return id in SECTION_DEFS;
}

const SIX_HOURS = 6 * 3600_000;

export async function getExploreSection(id: ExploreSectionId): Promise<ExploreSection> {
  return memo(`explore:${id}`, SIX_HOURS, async () => {
    const def = SECTION_DEFS[id];
    if (id === "trending") {
      const trending = (await getOpenLibraryTrending("weekly", 40)).filter((b) => isUsableBook(b) && b.coverUrl);
      const signals = buildSignals(EMPTY_PREFERENCES, []);
      const top = await enrichBooks(trending.slice(0, 10));
      return { id, title: def.title, blurb: def.blurb, books: top.map((b) => scoreBook(b, { ...signals, qualityMode: "popular" })) };
    }
    const result = await recommend({ ...EMPTY_PREFERENCES, ...def.prefs }, { qualityMode: def.qualityMode, enrichCount: 10 });
    const books = [...result.recommendations, ...result.reserve].filter((sb) => sb.book.coverUrl).slice(0, 10);
    return { id, title: def.title, blurb: def.blurb, books };
  });
}
