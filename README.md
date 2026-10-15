# Libria

**Tell me what you want to feel. I'll find the book.**

Libria is a book discovery app. Instead of a genre dropdown it asks how you want to feel, what you've loved, how much time you have and what to avoid. It then pulls candidates from [Open Library](https://openlibrary.org/developers/api) through several targeted routes, scores every one against a derived reader profile (optionally with a local embedding model), diversifies the final list, and explains exactly why each book made the cut.

No accounts, no paid APIs, no AI service required.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Optional settings are listed in `.env.example`.

```bash
npm run build && npm start   # production
npm test                     # engine tests on a synthetic catalog (no network)
npm run rec -- --scenario a --debug   # run a real scenario against Open Library and inspect every score
```

## What's inside

| Route | What it does |
| --- | --- |
| `/` | Landing page: lamp-lit library hero (canvas), live example shelf, how it works, start-with-a-feeling index |
| `/discover` | Eight-step discovery flow: mood, genre, reading time, experience, favorites, avoid, goals, own words |
| `/results` | Featured pick plus ranked recommendations with roles, "Why this?" panel with tradeoffs, "Not for me" feedback that re-ranks instantly |
| `/explore` | "If you liked…" (blended with your profile when you have one) plus live shelves: trending, think, hidden gems, short, immersive |
| `/surprise` | Fiction / non-fiction / anything, then a shuffled wildcard |
| `/shelf` | Want to Read, Favorites, Maybe Later (stored in this browser) |
| `/book/[id]` | Shareable book page; the same detail view opens as a sheet everywhere else |

## Architecture

```
app/                      routes and API route handlers
  api/search              autocomplete (title / author / subject)
  api/book/[id]           one normalized, enriched book
  api/recommend           POST preferences (+ session feedback) → ranked, explained recommendations
  api/similar/[id]        GET "if you liked" · POST the same blended 60/40 with the reader's profile
  api/explore/[section]   curated live shelves
  api/surprise            random well-rated wildcard
components/               UI, grouped by feature (hero, discovery, books, recommendations, shelf, search, explore, surprise, ui)
hooks/                    useRemote (abortable fetch), useBookSearch (debounced), useNearViewport
lib/api/                  the only place that talks to upstream APIs
  http.ts                 User-Agent, TTL cache, in-flight de-duplication, per-host concurrency limit, timeouts, retries
  openLibrary.ts          search, works, trending + normalization (including series volume detection)
  googleBooks.ts          optional fallback with automatic back-off on quota errors
  bookSearch.ts           Open Library → Google Books → normalize → dedupe
  dedupe.ts, validate.ts  identifier/title+author dedupe; defensive parsing of untrusted JSON
  client.ts               browser-side calls to our own routes (never upstream)
lib/recommendations/
  config.ts               every weight, priority multiplier, threshold and limit, in one place (engineVersion too)
  taxonomy.ts             reader language ↔ catalog subjects (tags, moods, goals, avoid lists, free-text lexicon)
  concepts.ts             adjacency map for exploration, hard-avoid thresholds, intensifiers, reference patterns
  profile.ts              infers tags, pace, complexity, intensity and tone from a book's metadata; tag association strength
  preferenceMapper.ts     preferences → derived reader profile (latent tastes, hard constraints, priorities, conflicts, semantic text)
  retrieval.ts            retrieval planner: genre, genre×mood, mood, liked-book, liked-concepts, latent, reference, free-text, exploration routes
  candidates.ts           runs the plan against Open Library (server), budgeted enrichment, reference resolution
  filters.ts              hard filters (excluded genres, length caps, already-read, children's books)
  quality.ts              metadata completeness, modest quality signal, popularity percentiles
  semantic/               local sentence-transformer (transformers.js), book/profile documents, disk-backed embedding cache
  scoring.ts              component scores (0..1), hybrid weighted score, soft penalties, novelty/familiarity
  rerank.ts               MMR diversity, author cap, series handling, exploration slots, roles (isomorphic)
  confidence.ts           confidence = completeness × candidate quality × score separation
  explain.ts              explanations, tradeoffs and the bookseller-style narrative, all from real signals
  select.ts               session feedback ("Not for me" + reason) and the browser-side re-rank entry point
  engine.ts               the pure pipeline: recommendBooks(signals, candidates, options), fully injectable
  recommendationEngine.ts the server wrapper: resolves liked books and references, retrieves, injects enrichment + embeddings
lib/storage/              safe localStorage wrappers; ShelfRepository interface (swap for an API when auth arrives)
scripts/recommend.mts     development runner: real scenarios, every candidate's component scores, timings
tests/                    vitest suite on a synthetic Open-Library-shaped catalog (profiles A–E, negatives, diversity, liked books, free text, feedback)
types/                    Book and Preferences
```

### The recommendation pipeline

```
preferences ─► derived reader profile ─► retrieval plan (≤12 routes) ─► normalize + dedupe
   ─► hard filters ─► metadata pre-score ─► enrich + embed the promising ones (in parallel)
   ─► hybrid scoring ─► MMR diversity + roles ─► confidence ─► explanations + tradeoffs
```

1. **Derived profile.** Answers become weighted tag sets with priorities (very important → weak), numeric targets (pace, complexity, intensity, tone), hard constraints (excluded genres, length cap, already-read), a latent profile shared across the liked books (Dune + The Martian → science, survival, world-building rather than "space opera" only), free-text concepts with scoped negation ("more philosophical and **less** depressing"), resolved references ("like The Martian"), detected contradictions, and a natural-language profile for the embedding model.
2. **Retrieval.** Each facet gets its own Open Library query: every genre, genre × mood themes, each liked book's distinctive subjects and its concepts, the latent profile, the reader's own words, plus one or two **exploration** queries one step sideways (science fiction → dystopian, philosophical, AI). Results are merged, de-duplicated and tagged with the routes that found them.
3. **Hard filters vs. soft preferences.** "Avoid horror" removes books that are *unmistakably* horror (two catalog subjects, or horror as the dominant genre) and heavily penalizes the rest; one stray "juvenile fiction" heading on *1984* no longer eliminates it. Soft preferences (pace, length, complexity…) only move the score.
4. **Hybrid scoring.** `score = Σ(weight × priority × component) / Σ(weight × priority)` over the components the reader expressed, times soft penalties. Components: semantic similarity (when the local model is available), genre, liked-book similarity (metadata + embeddings, max-led aggregation), themes, mood, goals, pace, complexity, length, tone, free text, metadata quality, quality. Weights live in `config.ts`.
5. **Diversity and roles.** Maximal Marginal Relevance against the books already chosen, one book per author, no sequels of a liked book (by title, subject or description), later volumes held back, ~25 % of slots reserved for exploration picks that still clear a relevance floor. Each pick gets a role: top match, safe choice, fresh perspective, hidden gem (only when reader-count data supports it), wildcard, a step outside your comfort zone.
6. **Confidence and explanations.** A numeric confidence (profile completeness × candidate quality × score separation) backs the high/medium/low label; close finishes are stated as such. Every explanation quotes the signals that scored, lists honest tradeoffs ("slower-paced than you asked for"), and the page opens with a bookseller-style summary of how the engine read the request.

"Not for me" with a reason ("too slow", "wrong genre", "too dark"…) re-ranks the rest of the list in the browser with the same reranker, using a similarity matrix shipped with the result; rejected books are also sent with the next request so they never come back. "Find another like this" blends 60 % similarity to the chosen book with 40 % of the original profile.

### Semantic similarity (optional, local, free)

`@huggingface/transformers` runs `Xenova/all-MiniLM-L6-v2` on the server (CPU, ONNX). The model downloads once into `.cache/transformers`; embeddings are cached in memory and in `.cache/libria/embeddings-*.jsonl` keyed by a stable book id + document hash. If the package, the model or the time budget fails, the engine scores with metadata only and the result says so (`semantic: false`). Set `LIBRIA_EMBEDDINGS=off` to disable it.

### Being a good API citizen

- Every upstream request carries an identifying User-Agent (set `LIBRIA_USER_AGENT` to add your contact details).
- Responses are cached in memory (hours for search, a day for works), identical in-flight requests are shared, and each host gets at most four concurrent requests.
- Description lookups are budgeted per request; whatever has not arrived in time is used as it was and lands in the cache for the next request.
- Autocomplete is debounced and cancels stale requests; explore shelves load only when scrolled near.
- Covers come straight from `covers.openlibrary.org` with `default=false`, so missing covers fall back to a typographic cover instead of a blank image.

## Tuning and debugging

- `npm test` runs the engine against `tests/fixtures/books.ts`, a synthetic catalog shaped like Open Library output (series volumes, crowd-edited headings, thin records). Scenarios cover profiles A–E from the brief, negative preferences, diversity, liked-book similarity (Dune alone vs. Dune + The Martian), free text, the fake-embedder path, feedback and "more like this".
- `npm run rec -- --scenario <a|b|c|d|e|blackmirror|dune|dune-martian|horror|sanderson|conflict|custom> [--debug] [--no-embed] [--like <workId>]` runs the real pipeline. `--debug` prints every query with its route and timing, every candidate's component scores, penalties, novelty and role, and the hard-filtered books with the reason.
- In development the API also returns the debug view when the request body has `"debug": true` or the header `x-libria-debug: 1`. Never in production.
- Weights, priorities, thresholds, MMR λ, exploration share and candidate limits are all in `lib/recommendations/config.ts`.

## Design notes

- **Concept:** the reading room after hours. Warm near-black, ivory type, one lamp-gold accent; mood colors appear only as faint light tied to what you choose.
- **Type:** Cormorant Garamond for display and reading text, Geist for interface.
- **Signature moment:** the hero canvas. Thousands of spines on parallax shelves; the pointer is a reading lamp. It pauses offscreen and renders a single still frame under `prefers-reduced-motion`.
- **Accessibility:** semantic landmarks, skip link, labelled dialogs with focus trap and return, keyboard navigation for option groups (arrow keys) and the flow (Enter, Alt+arrows), visible focus rings, alt text on covers, live regions for progress and toasts.

## Scenarios that were run against the live catalog

1. Make me think + Science Fiction + fast + liked Dune and Project Hail Mary + no romance → The Dispossessed, Seveneves (hidden gem), Annihilation, The Hitchhiker's Guide (fresh perspective), Foundation, Brave New World (labelled as slower than asked)… no Herbert sequels, no Dune expanded-universe volumes
2. "Something like Black Mirror but more philosophical and less depressing" → Murderbot, Anathem, Nineteen Eighty-Four, Notes from the Underground, Klara and the Sun; bleak books held back by the "less depressing" clause
3. Cozy + emotional + Romance + under 200 pages + easy → short contemporary romances, with Romeo and Juliet shown only as a labelled "step outside your comfort zone"
4. Uncomfortable + hooked + Mystery/Thriller + challenging + dark → Misery, House of Leaves, Dracula, Mystic River, American Psycho, The Secret History
5. Help me grow + Psychology/Business/Self-help → Mindset, 7 Habits, Deep Work-style non-fiction only
6. Liked Dune alone → The Left Hand of Darkness first; Dune + The Martian → Seveneves, The Dispossessed, hard science fiction moves up
7. Devastating intensity + "too depressing" avoided → the contradiction is named and resolved toward bittersweet literary fiction
8. No preferences → widely loved books, labelled as broad, low confidence, no match percentages
9. `LIBRIA_SIMULATE_OUTAGE=1` → every route returns 503 and the UI shows "The library is being a little quiet right now." with a retry
10. Mobile viewport (375×812) → full flow, bottom navigation, full-screen sheets

Book data and covers: Open Library (Internet Archive). Optional gap-filling: Google Books. Embeddings: a local MiniLM sentence-transformer, no API key.
