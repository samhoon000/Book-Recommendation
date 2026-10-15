import type { Book } from "@/types/book";
import type { FeedbackReason } from "@/types/preferences";
import type { TagId, WeightedTags } from "./taxonomy";
import type { Priority, ScoreComponent } from "./config";

/** What the engine infers about a book from its metadata. All values 0..1. */
export interface BookProfile {
  tags: WeightedTags;
  /** Which subject phrases produced each tag, used as evidence in explanations. */
  evidence: Partial<Record<TagId, string[]>>;
  subjects: string[];
  isFiction: boolean;
  isNonfiction: boolean;
  pace: { value: number; confidence: number };
  complexity: { value: number; confidence: number };
  intensity: { value: number; confidence: number };
  darkness: { value: number; confidence: number };
  /** True when there were too few subjects to say much. */
  thin: boolean;
}

export interface LikedProfile {
  id: string;
  title: string;
  authors: string[];
  profile: BookProfile;
  /** Human-readable concepts the engine extracted from this book (for retrieval, embeddings and explanations). */
  concepts: string[];
  /** "liked" came from the reader's list; "reference" was mentioned in free text ("like Black Mirror"); "focus" is "more like this". */
  origin: "liked" | "reference" | "focus";
  /** Relative weight inside the liked-book aggregation (focus books dominate "more like this"). */
  weight: number;
  /** Embedding of the book document, when the semantic engine ran. */
  embedding?: number[];
}

export interface PreferenceChip {
  kind: "mood" | "genre" | "goal" | "experience" | "length" | "liked" | "freeText";
  label: string;
  emoji?: string;
}

/** A single weighted preference with the priority it carries. */
export interface WeightedPreference {
  tag: TagId;
  label: string;
  weight: number;
  priority: Exclude<Priority, "hard">;
  /** Where it came from, for explanations: "mood", "genre", "goal", "liked", "freeText", "inferred". */
  source: string;
}

/** Constraints that eliminate candidates instead of scoring them. */
export interface HardConstraints {
  /** Books whose tag strength reaches the threshold are removed. */
  excludeTags: Array<{ tag: TagId; threshold: number; label: string }>;
  /** Pages above this (when known) are removed. */
  maxPages?: number;
  /** Children's books are always removed unless the reader asked for YA. */
  excludeChildren: boolean;
  /** Explicit adult-only request removes clearly juvenile books. */
  adultOnly: boolean;
  /** Already-read / rejected / liked ids and normalized titles. */
  excludeIds: string[];
  excludeTitles: string[];
  /** Terms whose presence in catalog subjects removes a book (from the "avoid" box with intensifiers). */
  excludeTerms: string[];
}

/** A contradiction the engine noticed in the answers and how it resolved it. */
export interface PreferenceConflict {
  between: [string, string];
  resolution: string;
}

/** Everything the scorer needs, derived once from the reader's preferences. Serializable. */
export interface Signals {
  moods: Array<{ chip: PreferenceChip; tags: WeightedTags; counter?: WeightedTags }>;
  genres: Array<{ chip: PreferenceChip; tags: WeightedTags; fiction: boolean }>;
  goals: Array<{ chip: PreferenceChip; tags: WeightedTags }>;
  /** Each phrase the reader typed becomes a group; a good match satisfies most groups, not just one. */
  freeText?: { text: string; tags: WeightedTags; groups: WeightedTags[]; terms: string[]; intensified: boolean };
  avoidTags: WeightedTags;
  avoidTerms: string[];
  avoidSlow: boolean;
  avoidComplex: boolean;
  avoidLong: boolean;
  pace?: { target: number; chip: PreferenceChip; inferred?: boolean };
  complexity?: { target: number; chip: PreferenceChip; inferred?: boolean };
  intensity?: { target: number; chip: PreferenceChip; inferred?: boolean };
  darkness?: { target: number; chip: PreferenceChip; inferred?: boolean };
  length?: { min: number; max: number; chip: PreferenceChip };
  age?: "ya" | "adult";
  liked: LikedProfile[];
  likedAuthors: string[];
  /** Fiction/non-fiction lean inferred from genres and moods: −1 non-fiction … +1 fiction. */
  fictionLean: number;
  /** "hidden" favors high ratings with few readers; "popular" favors widely read books. */
  qualityMode: "balanced" | "hidden" | "popular";

  /* ---- derived profile (v2) ---- */
  /** Latent tastes shared across the liked books, e.g. worldbuilding + politics for Dune + Foundation. */
  latent: WeightedTags;
  /** Weighted themes to score (`themeMatch`): latent + free-text + reference themes. */
  themes: WeightedTags;
  /** Every positive tag with its strongest weight, used for novelty / familiarity. */
  positiveTags: WeightedTags;
  preferredGenres: WeightedPreference[];
  preferredThemes: WeightedPreference[];
  positiveConcepts: string[];
  negativeConcepts: string[];
  /** Natural-language profile for the embedding model. Never contains negatives. */
  semanticProfileText: string;
  hard: HardConstraints;
  priorities: Partial<Record<ScoreComponent, Exclude<Priority, "hard">>>;
  conflicts: PreferenceConflict[];
  /** Dimensions the reader answered, for confidence (0..1). */
  completeness: number;
  /** Set for "more like this": final score blends similarity to this book with the profile. */
  focus?: LikedProfile;
}

export type MatchReasonKind = "mood" | "genre" | "liked" | "goal" | "pace" | "complexity" | "length" | "quality" | "freeText" | "tone" | "maturity" | "theme" | "semantic";

export interface MatchReason {
  kind: MatchReasonKind;
  /** e.g. "You wanted fast-paced stories" */
  heading: string;
  /** e.g. "Its catalog subjects (suspense, espionage) usually signal strong narrative drive." */
  detail: string;
  strength: number;
}

export type RecommendationRole = "perfect" | "safe" | "fresh" | "hiddenGem" | "wildcard" | "challenge" | "strong" | "good";

export const ROLE_LABEL: Record<RecommendationRole, string> = {
  perfect: "Top match",
  safe: "Safe choice",
  fresh: "Fresh perspective",
  hiddenGem: "Hidden gem",
  wildcard: "Wildcard",
  challenge: "A step outside your comfort zone",
  strong: "Strong match",
  good: "Good match",
};

export interface RecommendationExplanation {
  strongestMatches: Array<{ signal: string; strength: number; explanation: string }>;
  tradeoffs: string[];
  explorationReason?: string;
  /** 0..1, the engine's confidence in this specific pick. */
  confidence: number;
  /** One or two sentences in a bookseller's voice, built from the signals above. */
  summary: string;
}

export interface ScoredBook {
  book: Book;
  score: number;
  /** Score before avoid/feedback penalties. */
  baseScore: number;
  components: Partial<Record<ScoreComponent, number>>;
  penalties: string[];
  reasons: MatchReason[];
  matched: PreferenceChip[];
  profile: BookProfile;

  /* ---- v2 ---- */
  role?: RecommendationRole;
  roleLabel?: string;
  explanation?: RecommendationExplanation;
  /** Same as `matched`, named as the engine API describes it. */
  matchedSignals?: PreferenceChip[];
  tradeoffs?: string[];
  confidence?: number;
  /** Retrieval routes that surfaced this candidate (genre, mood, liked, freeText, exploration…). */
  routes?: string[];
  /** 0..1: how much of the book's strongest concepts are new to the reader. */
  novelty?: number;
  /** 0..1: how close the book sits to what the reader already said they like. */
  familiarity?: number;
  /** Popularity percentile inside this candidate pool (0 = least known). Undefined when the catalog gave no reader counts. */
  popularityPercentile?: number;
  /** Pre-penalty semantic cosine (debugging). */
  semanticCosine?: number;
}

export type Confidence = "high" | "medium" | "low";

export interface RetrievalQueryDebug {
  route: string;
  q: string;
  sort?: string;
  limit: number;
  returned: number;
  ms: number;
  failed?: boolean;
}

export interface CandidateDebug {
  id: string;
  title: string;
  author: string;
  final: number;
  base: number;
  components: Partial<Record<ScoreComponent, number>>;
  penaltyMultiplier: number;
  penalties: string[];
  routes: string[];
  role?: RecommendationRole;
  novelty?: number;
  familiarity?: number;
  semanticCosine?: number;
  /** Set when a hard filter removed the book before scoring. */
  filtered?: string;
  selected: boolean;
}

export interface EngineTimings {
  retrievalMs: number;
  normalizeMs: number;
  enrichMs: number;
  embedMs: number;
  scoringMs: number;
  rerankMs: number;
  totalMs: number;
}

export interface RecommendationDebug {
  timings: EngineTimings;
  queries: RetrievalQueryDebug[];
  semantic: { available: boolean; model?: string; embedded: number; cacheHits: number };
  poolSize: number;
  filtered: number;
  candidates: CandidateDebug[];
  signals: Omit<Signals, "liked" | "focus"> & { liked: Array<Omit<LikedProfile, "embedding" | "profile">> };
}

/** Pairwise similarity between the shipped candidates so the browser can re-diversify after feedback. */
export interface SimilarityMatrix {
  ids: string[];
  /** rows[i][j] in 0..1, rounded to two decimals. */
  rows: number[][];
}

export interface RecommendationResult {
  recommendations: ScoredBook[];
  /** Additional ranked candidates, used to refill the list after "Not for me". */
  reserve: ScoredBook[];
  confidence: Confidence;
  /** "broad" when the reader gave no preferences: ranking reflects reader ratings only, so no match percentage is shown. */
  mode: "personal" | "broad";
  summary: string;
  chips: PreferenceChip[];
  poolSize: number;

  /* ---- v2 ---- */
  engineVersion: string;
  /** 0..1 numeric confidence behind the categorical one. */
  confidenceScore: number;
  /** True when the first pick is clearly ahead of the second; false when the top picks finished close together. */
  clearWinner: boolean;
  /** A few sentences describing how the engine understood the reader. */
  profileSummary: string;
  conflicts: PreferenceConflict[];
  similarity?: SimilarityMatrix;
  semantic: boolean;
  /** What the browser needs to re-rank consistently after "Not for me" feedback. */
  hints?: { complexityTarget?: number; paceTarget?: number; explorationShare?: number };
  debug?: RecommendationDebug;
}

export interface SessionFeedback {
  bookId: string;
  reason?: FeedbackReason;
}

/** What the browser remembers about this session and sends with a new request. */
export interface SessionContext {
  rejected: SessionFeedback[];
  /** Books shown before in this session: never shown again, so "edit preferences" yields new picks. */
  seen?: string[];
}
