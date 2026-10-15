/**
 * Every tunable number in the recommendation engine lives here.
 *
 * Final score = Σ(weight × priority × componentMatch) / Σ(weight × priority of the components the reader expressed)
 *               × soft penalties (things to avoid, session feedback)
 *
 * Components the reader skipped are left out of the denominator, so skipping a question never
 * drags a book down. Weights are starting values, not sacred ones: tune them with the debug
 * output (`npm run rec -- --debug`) and the scenario tests.
 */

export const ENGINE_VERSION = "2.0.0";

/** Hybrid scoring weights. Used when the semantic engine is available; renormalized without it. */
export const SCORE_WEIGHTS = {
  semantic: 0.25,
  genreMatch: 0.15,
  likedBookSimilarity: 0.15,
  themeMatch: 0.1,
  moodMatch: 0.08,
  goalMatch: 0.07,
  paceMatch: 0.05,
  complexityMatch: 0.07,
  lengthMatch: 0.05,
  metadataQuality: 0.04,
  quality: 0.02,
  /** Deterministic free-text match (lexicon tags + keyword hits). Carries the load when embeddings are off. */
  freeTextMatch: 0.1,
  toneMatch: 0.05,
  maturityMatch: 0.02,
} as const;

export type ScoreComponent = keyof typeof SCORE_WEIGHTS;

/** Preference priorities. Hard constraints never reach the scorer: they filter. */
export type Priority = "hard" | "veryImportant" | "important" | "preference" | "weak";

export const PRIORITY_MULTIPLIER: Record<Exclude<Priority, "hard">, number> = {
  veryImportant: 1.4,
  important: 1.0,
  preference: 0.7,
  weak: 0.4,
};

/** Default priority per component; `deriveProfile` raises or lowers these from context. */
export const DEFAULT_PRIORITY: Record<ScoreComponent, Exclude<Priority, "hard">> = {
  semantic: "important",
  genreMatch: "important",
  likedBookSimilarity: "veryImportant",
  themeMatch: "important",
  moodMatch: "important",
  goalMatch: "preference",
  paceMatch: "preference",
  complexityMatch: "preference",
  lengthMatch: "preference",
  metadataQuality: "important",
  quality: "important",
  freeTextMatch: "important",
  toneMatch: "preference",
  maturityMatch: "weak",
};

/** Negative preferences. */
export const NEGATIVE = {
  /** Free-text negations ("no romance") remove a book only when the association is unmistakable (tagAssociation scale). */
  freeTextHardThreshold: 0.9,
  /** Below the hard threshold the penalty multiplier is 1 − strength × weight × softStrength. */
  softStrength: 0.9,
  /** Multiplier per avoided term found in subjects / in the description only. */
  termInSubjects: 0.5,
  termInDescription: 0.72,
  /** Books longer than max × factor + slack pages are removed when the reader asked for a length. */
  hardLengthFactor: 1.75,
  hardLengthSlack: 60,
  /** Semantic distance to the reader's negative concepts: penalize above this cosine. */
  semanticThreshold: 0.5,
  semanticStrength: 1.4,
} as const;

/** How semantic cosine similarity is mapped to 0..1 (MiniLM-style models rarely exceed ~0.7). */
export const SEMANTIC_CALIBRATION = {
  profile: { low: 0.12, high: 0.6 },
  likedBook: { low: 0.2, high: 0.78 },
  /** Share of liked-book similarity that comes from embeddings when they are available. */
  likedSemanticShare: 0.5,
} as const;

export const LIKED_AGGREGATION = {
  /** likedBookSimilarity = max × maxShare + mean(top-2) × (1 − maxShare). */
  maxShare: 0.6,
} as const;

export const SELECTION = {
  maxResults: 10,
  minScore: 0.42,
  minDesired: 5,
  fallbackMinScore: 0.33,
  confidentTopScore: 0.6,
  maxPerAuthor: 1,
  likedAuthorPenalty: 0.82,
  /** MMR: value = relevance − λ × max similarity to the books already chosen. */
  mmrLambda: 0.28,
  /** Share of the final list reserved for exploration when candidates qualify. */
  explorationShare: 0.25,
  /** An exploration pick must still score at least this fraction of the top score. */
  explorationFloor: 0.74,
  /** Pairwise similarity above which two candidates count as "the same flavor". */
  nearDuplicate: 0.92,
  reserveSize: 24,
} as const;

export const ROLES = {
  hiddenGem: { maxPopularityPercentile: 0.35, minScoreShare: 0.85, minRating: 3.75, minRatings: 8 },
  wildcard: { minNovelty: 0.5, maxFamiliarity: 0.62 },
  fresh: { minNovelty: 0.45, minFamiliarity: 0.5 },
  challenge: { complexityGap: 0.22, paceGap: 0.3, minConfidence: 0.3 },
  safe: { minFamiliarity: 0.75 },
} as const;

export const CONFIDENCE = {
  high: 0.62,
  medium: 0.4,
  /** Top two must differ by at least this for the first pick to be called a clear winner. */
  clearWinnerGap: 0.06,
} as const;

/** Candidate pool limits: keep the request fast and the API usage polite. */
export const RETRIEVAL = {
  maxQueries: 12,
  defaultLimit: 30,
  likedLimit: 40,
  explorationLimit: 20,
  /** Only this many top candidates (by metadata pre-score) get a description lookup. */
  enrichCount: 18,
  /** Description lookups that have not returned by then are skipped for this request (they stay cached for the next). */
  enrichBudgetMs: 4500,
  /** After ranking, how long the shown picks may wait for their English edition titles (mostly cache hits by then). */
  titleBudgetMs: 2000,
  /** Only this many top candidates (by metadata pre-score) are embedded. */
  embedCount: 40,
  /** How long a request waits for the embedding model to warm up before scoring without it. */
  embedWarmupWaitMs: 1500,
  /** Hard cap for the embedding step inside one request. */
  embedBudgetMs: 6000,
} as const;

export const EMBEDDINGS = {
  model: process.env.LIBRIA_EMBEDDING_MODEL ?? "Xenova/all-MiniLM-L6-v2",
  /**
   * Off with LIBRIA_EMBEDDINGS=off. Also off on Vercel unless LIBRIA_EMBEDDINGS=on: the native ONNX runtime is
   * excluded from the serverless bundle (next.config.ts) and the model cache has nowhere persistent to live there.
   */
  enabled: process.env.LIBRIA_EMBEDDINGS === "on" || (process.env.LIBRIA_EMBEDDINGS !== "off" && !process.env.VERCEL),
  cacheDir: process.env.LIBRIA_CACHE_DIR ?? ".cache",
  maxMemoryEntries: 6000,
  /** Length of a book document fed to the model (the model truncates at 256 tokens anyway). */
  maxDocumentChars: 700,
} as const;

/** "More like this": similarity to the chosen book vs. the reader's original profile. */
export const FOCUS_BLEND = { focus: 0.6, profile: 0.4 } as const;

/** Session feedback ("Not for me" + reason). Multipliers applied to books sharing the trait. Compound across rejections. */
export const FEEDBACK = {
  tooLong: 0.55,
  tooSlow: 0.5,
  wrongGenre: 0.42,
  wrongGenreSecondary: 0.75,
  tooDark: 0.5,
  tooEmotional: 0.55,
  subjectStrong: 0.5,
  subjectWeak: 0.78,
  sameAuthor: 0.6,
  nearTwin: 0.7,
  /** Tag cosine above which an unexplained rejection also dampens look-alikes. */
  nearTwinSimilarity: 0.86,
} as const;

/** Legacy export kept for modules that still import it. */
export const AVOID_STRENGTH = NEGATIVE.softStrength;
