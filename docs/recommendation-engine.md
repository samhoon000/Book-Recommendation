# Recommendation engine v2

Engine version: `2.0.0` (`ENGINE_VERSION` in `lib/recommendations/config.ts`, returned on every result).

## Audit of the previous engine (v1)

What worked and was kept: the tag taxonomy with Open Library subject mappings, book profile inference (pace, complexity, intensity, darkness), the lexicon-based free-text parser, targeted multi-query retrieval, id/ISBN/title dedupe, evidence-quoting explanations, in-browser feedback re-ranking, and the polite cached HTTP layer.

Weaknesses found:

- All matching was tag-regex based; no semantic similarity.
- "Avoid" answers were mild multipliers; nothing was ever eliminated, and nothing was prioritized.
- Liked books were scored one by one; there was no latent profile across several favorites and retrieval only used their exact subjects.
- Diversity was one-book-per-author only; five near-identical space operas were possible. No roles, no exploration.
- Explanations listed matches but never differences; confidence was categorical with no score-separation logic.
- Popularity was mixed into "quality"; metadata completeness was not scored.
- No debug output, no timings, no caches for expensive work, no tests.
- "Find another like this" forgot the reader's original profile.

## Pipeline

```
Preferences
  └─ buildSignals()  ........... preferenceMapper.ts   derived profile: weighted prefs + priorities, hard constraints,
                                                        latent tastes across liked books, conflicts, semantic text
  └─ planRetrieval() ........... retrieval.ts          ≤12 routes: genre, genre+mood, mood, liked, liked-concepts,
                                                        latent, reference, freeText, freeText-terms, goal, exploration, broad
  └─ retrieveCandidates() ...... candidates.ts         Open Library (Google Books fallback), dedupe, route tagging
  └─ recommendBooks() .......... engine.ts
       1 buildProfile() ......... profile.ts            tags with evidence, pace/complexity/intensity/darkness
       2 applyHardFilters() ..... filters.ts            excluded genres (association ≥ threshold), length cap, read/rejected,
                                                        children's books, avoid-box terms
       3 pre-score (metadata) ... scoring.ts            decides who gets enrichment and embeddings
       4 enrich ∥ embed ......... candidates.ts/semantic descriptions + English edition titles for the top N (budgeted) while the rest is embedded
       5 scoreBook() ............ scoring.ts            hybrid weighted score × soft penalties; novelty, familiarity
       6 rerank() ............... rerank.ts             MMR, author cap, series rules, exploration slots, roles
       7 computeConfidence() .... confidence.ts         completeness × candidate quality × separation; clear winner?
       8 buildExplanation() ..... explain.ts            strongest matches, tradeoffs, exploration reason, summary
```

`recommendBooks(signals, candidates, options)` is pure: the catalog enricher, the embedder, the cache-aware batch embedder and the retrieval routes are injected. Tests run it on `tests/fixtures/books.ts` with a deterministic bag-of-words embedder.

## Scoring

```
score = Σ_i w_i · p_i · v_i / Σ_i w_i · p_i   over components the reader expressed, then × penalties
```

| component | weight | expressed when |
| --- | --- | --- |
| semantic | 0.25 | embedder available and profile text non-empty |
| genreMatch | 0.15 | genres chosen |
| likedBookSimilarity | 0.15 | liked books or resolved references |
| themeMatch | 0.10 | latent / free-text themes |
| moodMatch | 0.08 | moods chosen |
| goalMatch | 0.07 | goals chosen |
| paceMatch | 0.05 | pace chosen, "too slow" avoided, or inferred from favorites (weak) |
| complexityMatch | 0.07 | complexity chosen / avoided / inferred |
| lengthMatch | 0.05 | length chosen or "long books" avoided |
| toneMatch | 0.05 | intensity or ending chosen |
| freeTextMatch | 0.10 | free text |
| maturityMatch | 0.02 | age chosen |
| metadataQuality | 0.04 | always |
| quality | 0.02 | always |

Priority multipliers: veryImportant 1.4, important 1.0, preference 0.7, weak 0.4. Liked books are very important; a single chosen genre, an intensified free text ("I really want…"), an extreme pace/complexity/intensity choice and an extreme length choice are promoted; inferred axes are weak.

Semantic cosines are calibrated linearly (profile 0.12→0.60, liked book 0.20→0.78). Candidates outside the embedded set receive a neutral imputed semantic value so they never gain from being un-embedded.

### Negatives

- `tagAssociation` measures evidence, not raw strength: two catalog subjects or the dominant genre = 1.0, one subject = 0.55, compound heading = 0.45, description only = 0.2.
- Hard: avoid-list genres at association ≥ 0.9 (`HARD_AVOID` in `concepts.ts`); free-text refusals with an intensifier ("absolutely no romance") at ≥ 0.9; page cap `max × 1.75 + 60`; listed/rejected/seen ids; clear children's books.
- Soft: `× (1 − 0.9 · association · weight)` per avoided tag; avoided terms in subjects ×0.5, in the description ×0.72; slow/complex/long ×0.6/0.6/0.55; a semantic gist check against the negative concepts.

### Diversity, roles, exploration

MMR value = `score − 0.28 · max similarity to the chosen set`, similarity = 0.45 tag cosine + 0.25 subject overlap + 0.30 embedding cosine. One book per author; a sibling of a liked book (same author + title, universe-naming subject, or the liked title used as a proper noun in the description by the same author) is excluded; later volumes (title, catalog title or "the third book in…" descriptions) are penalized ×0.6; among near-equal same-series candidates the best-known is preferred. 25 % of the slots are reserved for exploration picks (novel strong concept, or surfaced only by the exploration route) that still score ≥ 0.74 × top.

Roles, assigned once each after selection: hidden gem (popularity percentile ≤ 0.35 with ≥ 8 ratings ≥ 3.75 and score ≥ 0.85 × top), wildcard (novelty ≥ 0.5, familiarity ≤ 0.62), challenge (complexity above target by ≥ 0.22 or pace below by ≥ 0.3, with confident estimates), fresh perspective (novelty ≥ 0.45 with familiarity ≥ 0.5), safe choice (familiarity ≥ 0.75).

### Confidence

`sqrt(completeness) × candidateQuality^0.7 × separation`; high ≥ 0.62, medium ≥ 0.40. `clearWinner` is false when the top two are within 0.06, and the narrative then says the picks finished close together.

## Feedback and "more like this"

- The browser applies `applyFeedback` (strong, compounding multipliers per reason) and re-runs the same reranker with the shipped similarity matrix. Rejections are also posted as `session.rejected` on later requests and become hard excludes plus reason-driven penalties.
- `similarTo(id, prefs)` sets a focus book: `score = 0.6 × similarity(focus) + 0.4 × profile score` (the profile share shrinks when the reader answered little). Exploration slots are off for "more like this".

## Performance (measured on the live catalog, cold caches)

| step | typical |
| --- | --- |
| retrieval (10–12 Open Library queries, 4 concurrent) | 2–4 s |
| normalize + hard filters (150–200 books) | ~0.15 s |
| enrichment (top 18, budget 4.5 s) ∥ embedding batch 1 | 2.5–3.5 s |
| embedding batch 2 (enriched docs) | 0.5–1.5 s cold, ~0 warm |
| scoring + rerank | < 0.1 s |

Embeddings are cached on disk per book document, so repeat and overlapping requests skip the model entirely. With the model off, a request is retrieval + enrichment only.

## Adding a signal

1. Add the weight to `SCORE_WEIGHTS` and a default priority in `config.ts`.
2. Compute it in `scoreComponents` (0..1, with a `note` for explanations).
3. Add a reason in `explain.ts` (quote the evidence) and, if it can disappoint, a tradeoff.
4. Cover it in `tests/engine.test.ts`.
