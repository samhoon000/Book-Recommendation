import type { FeedbackReason } from "@/types/preferences";
import { FEEDBACK } from "./config";
import { tagCosine } from "./profile";
import { rerank, type RerankContext } from "./rerank";
import { TAGS, type TagId } from "./taxonomy";
import type { Confidence, ScoredBook } from "./types";

/**
 * Isomorphic ranking helpers: used by the server engine and again in the browser
 * when "Not for me" feedback re-ranks the current session without another API call.
 */

export type SelectionContext = RerankContext;

export interface Selection {
  recommendations: ScoredBook[];
  reserve: ScoredBook[];
  confidence: Confidence;
}

/** Rank, diversify and cut at a quality bar. Prefers five strong picks to ten weak ones. */
export function selectRecommendations(pool: ScoredBook[], ctx: SelectionContext, positiveTags: Set<string> = new Set()): Selection {
  const r = rerank(pool, ctx, positiveTags);
  return { recommendations: r.recommendations, reserve: r.reserve, confidence: r.confidence };
}

export interface RejectedBook {
  scored: ScoredBook;
  reason?: FeedbackReason;
}

function primaryTag(sb: ScoredBook, kind: "genre" | "theme" = "genre"): TagId | undefined {
  return (Object.entries(sb.profile.tags) as Array<[TagId, number]>)
    .filter(([id]) => TAGS[id].kind === kind)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
}

function distinctiveSubjects(sb: ScoredBook): string[] {
  return sb.profile.subjects.filter((s) => !/fiction|general|novel|literature/.test(s)).slice(0, 10);
}

/**
 * Apply "Not for me" feedback to the remaining candidates of this session.
 * Each reason is a strong, compounding penalty on books that share the rejected book's trait,
 * so rejecting two slow literary novels pushes the third one out entirely. Session-level only.
 */
export function applyFeedback(pool: ScoredBook[], rejected: RejectedBook[]): ScoredBook[] {
  if (!rejected.length) return pool;
  const rejectedIds = new Set(rejected.map((r) => r.scored.book.id));
  return pool
    .filter((sb) => !rejectedIds.has(sb.book.id))
    .map((sb) => {
      let m = 1;
      const notes: string[] = [];
      for (const { scored: r, reason } of rejected) {
        switch (reason) {
          case "too-long": {
            const cap = Math.max(250, (r.book.pageCount ?? 450) * 0.85);
            if (sb.book.pageCount && sb.book.pageCount > cap) {
              m *= FEEDBACK.tooLong;
              notes.push("length");
            }
            break;
          }
          case "too-slow":
            if (sb.profile.pace.value < 0.5 && sb.profile.pace.confidence > 0.2) {
              m *= FEEDBACK.tooSlow;
              notes.push("pace");
            }
            break;
          case "wrong-genre": {
            const tag = primaryTag(r);
            if (tag && (sb.profile.tags[tag] ?? 0) > 0.4) {
              m *= FEEDBACK.wrongGenre;
              notes.push(TAGS[tag].label);
            }
            const theme = primaryTag(r, "theme");
            if (theme && (sb.profile.tags[theme] ?? 0) > 0.5) m *= FEEDBACK.wrongGenreSecondary;
            break;
          }
          case "too-dark":
            if (sb.profile.darkness.value > 0.5 && sb.profile.darkness.confidence > 0.2) {
              m *= FEEDBACK.tooDark;
              notes.push("tone");
            }
            break;
          case "too-emotional":
            if (sb.profile.intensity.value > 0.55 && sb.profile.intensity.confidence > 0.2) {
              m *= FEEDBACK.tooEmotional;
              notes.push("intensity");
            }
            break;
          case "subject": {
            const mine = distinctiveSubjects(r);
            const shared = sb.profile.subjects.filter((s) => mine.includes(s));
            if (shared.length >= 2) {
              m *= FEEDBACK.subjectStrong;
              notes.push("subject");
            } else if (shared.length === 1) m *= FEEDBACK.subjectWeak;
            break;
          }
          case "already-read":
            break;
          default: {
            if (sb.book.authors[0] && sb.book.authors[0] === r.book.authors[0]) {
              m *= FEEDBACK.sameAuthor;
              notes.push("author");
            }
            if (tagCosine(sb.profile.tags, r.profile.tags) >= FEEDBACK.nearTwinSimilarity) {
              m *= FEEDBACK.nearTwin;
              notes.push("look-alike");
            }
          }
        }
      }
      if (m === 1) return sb;
      return { ...sb, score: Math.round(sb.score * m * 1000) / 1000, penalties: [...sb.penalties, `adjusted by your feedback (${Array.from(new Set(notes)).join(", ") || "similar book"})`] };
    });
}

export function matchLabel(score: number): string {
  if (score >= 0.78) return "Excellent match";
  if (score >= 0.64) return "Strong match";
  if (score >= 0.5) return "Good match";
  if (score >= 0.42) return "Interesting match";
  return "Worth a look";
}
