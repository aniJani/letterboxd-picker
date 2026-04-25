# Letterboxd Watchlist Picker — Design Spec

**Date:** 2026-04-25
**Status:** Approved for implementation planning

## 1. Overview

A single-page web app that turns a user's Letterboxd watchlist into tonight's film. The user enters their Letterboxd username, sets three filters (Genre / Decade / Min Rating) on a stylised cinema letter-board, hits PICK, and the board reveals the chosen film with poster, director, year, runtime, and synopsis. A Reroll button picks again from the same filtered pool.

**Aesthetic:** brutalist editorial. Cream paper background, oversized Helvetica display type, thick rules, red accent. The central interaction element is a black cinema letter-board (white plastic letters in a wood frame), used both as filter UI and result reveal. The board never changes shape — only the letters in it.

**Why these choices:** the watchlist is already curated by the user; the tool's job is to remove the indecision of choosing among curated options. Filters narrow to a mood; randomness commits.

## 2. User Journey

1. **Land.** Cream brutalist page. Title `PICK ME / A FILM.` with a red accent dot. One-sentence standfirst. `@_______` username field with a thick black underline. Letter-board sits idle in filter mode below.
2. **Type username, blur (or press enter).** Page kicks off the watchlist scrape silently. Board's footer flips from `— NOW SHOWING —` to a live counter: `LOADING · 47 / 312`. PICK button is dimmed during loading.
3. **Scrape complete.** Footer returns to `— NOW SHOWING —`. PICK lights up. Filter columns populate from real watchlist data.
4. **Adjust filters.** Three columns scroll independently — Genre, Decade, Min Rating. Each change updates a small caption beneath the board: `42 FILMS MATCH`.
5. **PICK.** Page title shifts from `PICK ME / A FILM.` to `TONIGHT, / YOU WATCH`. Filter columns dissolve. Chosen film's title slides into the board left-to-right, one letter every ~80ms with a soft thud (subtle, off by default; toggleable). Below the board: poster, director, runtime, synopsis. Two buttons: `↻ Reroll` and `View on Letterboxd ↗`.
6. **Reroll.** Letters slide out right (~60ms each, staggered), new title slides in. Excludes the just-picked film so consecutive rerolls don't repeat. ~700ms total.
7. **Edit filters.** Small `← Edit filters` link returns the board to filter mode without re-scraping.

## 3. Visual Design Spec

### 3.1 Layout

- Single column, max-width 720px.
- Outer padding: 40px desktop, 20px mobile.
- Vertical rhythm: 8px grid.
- Whole page fits in one viewport on desktop. Mobile scrolls naturally.
- No global nav, no full footer — only a thin colophon line at the bottom.

### 3.2 Type

- Display & body: `Helvetica Neue → Inter → system-ui`.
- Cinema board values: same family, `font-weight: 900`, letter-spacing `0.06–0.15em`, all caps.
- Small labels and counters: `Courier New → ui-monospace` (mono caps).
- Sizes:
  - H1: 64px / line-height 0.88 / letter-spacing -0.04em
  - Standfirst: 13px
  - Board values: 36–48px
  - Board labels: 10px, letter-spacing 0.25em
  - Meta lines: 11px mono

### 3.3 Color tokens

```css
--paper:        #efece4;  /* page background — warm cream */
--ink:          #111111;  /* text, rules, button bg */
--accent:       #d61e2a;  /* period in title, button drop-shadow, № mark */
--board-frame:  #5a3a1f;  /* wood frame, 8px band */
--board-bg:     #0c0c0c;  /* board panel */
--board-letter: #f5f0e6;  /* warm white plastic letters */
--amber:        #d4a04a;  /* "now showing", star ratings */
--muted:        #8a8378;  /* tertiary text */
```

Light mode only. Brutalist designs do not invert cleanly; dark mode is out of scope.

### 3.4 Letter-board component

- Outer wood frame: 8px solid `--board-frame`, with 4px outset shadow `#2c1d0e`.
- Inner panel: `--board-bg` with two thin pinstripe rows (top + bottom, repeating-linear-gradient at 14px / 18px) suggesting sliding-letter tracks.
- Three modes (one shell):
  - **Filter mode:** three columns (Genre / Decade / Min Rating). Each = ▲ / value / ▼ stacked vertically. Click arrows or use scroll wheel to advance. Active column gets a faint amber underline.
  - **Loading mode:** filter columns visible and scrollable (the user can pre-set their filters during the wait); the PICK button is dimmed and disabled. Footer shows `LOADING · 47 / 312`.
  - **Result mode:** centered title (1–2 lines, max 16 chars per line, smart line-break), `— NOW SHOWING —` line above, `DIRECTOR · YEAR · RUNTIME` mono line below, ★ row at the bottom in amber.
- Footer counter (outside the wood frame, on the cream page): `42 FILMS MATCH` or `LOADING · 47 / 312` in 10px mono caps.

### 3.5 Buttons

- **PICK MY FILM ▸**: full-width black block, cream text, 18px padding, weight 900, `0.2em` tracking. Red 6px offset drop-shadow. Hover: nudge -2/-2px and grow shadow to 8px. The ▸ arrow is red.
- **Reroll** (outline) and **View on Letterboxd ↗** (solid black) sit side-by-side after pick. 12px font, `0.2em` tracking.

### 3.6 Mobile

- Filter columns stack 1×3 vertically below 540px (each its own row).
- H1 scales to 44px.
- Board minimum width: 280px. It is the visual anchor of the page.

### 3.7 Motion

- Filter scroll: 180ms ease-out per click. Letters fade between values (cleaner with plastic letters than mechanical flip).
- Reveal: 80ms per letter, slide in from left with 4px overshoot then settle. Whole reveal capped at ~1.2s; long titles speed per-letter cadence to stay within budget.
- Optional thud sound: off by default, toggleable via a small icon in the colophon. Web Audio short click sample, ≤30KB.
- Reroll: letters slide out right (60ms each, staggered), new title slides in. ~700ms total.
- `prefers-reduced-motion: reduce` → letters appear instantly with no slide. Metaphor preserved.

## 4. Architecture

### 4.1 Stack

- Next.js 15 (App Router)
- TypeScript (strict)
- Tailwind v4 with custom CSS variables for the palette (Section 3.3)
- `cheerio` for HTML parsing
- TMDB API for film metadata
- `zod` for runtime validation at boundaries
- Vercel KV for caching
- Hosted on Vercel

### 4.2 Repository layout

```
app/
  page.tsx                   ← Server Component shell
  page.client.tsx            ← interactive root (filters, pick, reveal)
  api/
    watchlist/route.ts       ← GET ?user=<handle> · streams enriched list (NDJSON)
    film/route.ts            ← GET ?slug=<lbx-slug> · single-film enrich (retry path)
  layout.tsx
  globals.css                ← brutalist palette, type cascade

components/
  Header.tsx                 ← brand + № mark + standfirst
  UsernameInput.tsx          ← @ field, validation, submit
  LetterBoard.tsx            ← THE central component. Filter | Loading | Result modes
  FilterColumn.tsx           ← one scroll-column (used 3× inside LetterBoard)
  PickButton.tsx             ← brutalist black/red button with red drop-shadow
  FilmDetails.tsx            ← poster + director + synopsis + Reroll/Letterboxd buttons
  ProgressLine.tsx           ← board footer caption (counts, "match" copy)

lib/
  letterboxd.ts              ← scrapeWatchlist(user), scrapeFilmRating(slug)
  tmdb.ts                    ← searchByTitleYear(...), getMovie(...)
  enrich.ts                  ← orchestrates concurrent enrichment, retries
  cache.ts                   ← KV read/write with TTL; keyed by username
  filter.ts                  ← pure filter + random-pick logic
  types.ts                   ← Film, Watchlist, FilterState (zod schemas)
```

### 4.3 Component boundaries

Each unit has one purpose, a well-defined interface, and is testable in isolation.

- `LetterBoard` is the only component that knows about the board's visual chrome. Accepts a discriminated union prop: `{mode: 'filter', state, onChange}` or `{mode: 'loading', loaded, total}` or `{mode: 'result', film}`. Consumers never style it.
- `FilterColumn` is a generic scroll-picker over `string[]`. Knows nothing about the board.
- `lib/letterboxd.ts` is pure scraping. Input: username. Output: `{slug, title, year, lbxRating}[]`. No knowledge of TMDB, cache, or HTTP layer.
- `lib/tmdb.ts` is a pure TMDB client. No knowledge of Letterboxd.
- `lib/enrich.ts` is the only place those two are composed. Cache lives one layer above (in the route handler).
- `lib/filter.ts` is pure functions. `applyFilters(films, state) → films[]`, `pickRandom(films, exclude?) → film`. No React, no fetch. Trivially unit-testable.

### 4.4 Data flow (happy path)

1. User submits `@handle` from `UsernameInput`. Client calls `GET /api/watchlist?user=<handle>` (Route Handler, server-side).
2. Route handler:
   - Cache lookup (`wl:v1:<lowercase-username>`). Hit (TTL 6h) → stream cached `Film[]` as a single `done` event and return.
   - Miss → `letterboxd.scrapeWatchlist(user)` paginates `/<user>/watchlist/page/N/` until exhausted. Returns `{slug, title, year}[]`.
   - `enrich.enrich(stubs)` runs concurrent (cap 10) per-film: TMDB lookup by title+year (poster, genres, runtime, synopsis) + Letterboxd film-page scrape for community rating. Streams progress events as NDJSON chunks (Section 5).
   - On completion, write enriched list to KV.
3. Client reads stream with `ReadableStream.getReader()`. `LetterBoard` enters `loading` mode for progress, transitions to `filter` mode on `done`.
4. Filter columns derive option lists from loaded data:
   - **Genre column:** `[ANY, ...unique genres sorted alphabetically]`. `ANY` is the default and disables genre filtering.
   - **Decade column:** `[ANY, ...decades present in the watchlist sorted descending]` (e.g. `2020s`, `2010s`, ...). `ANY` is default.
   - **Min Rating column:** `[★ 0+, ★ 0.5+, ★ 1.0+, ..., ★ 5.0]`. `★ 0+` is the default and is treated as no rating filter (films with `lbxRating: null` pass). Any value `> 0` excludes films with `null` rating.
5. User scrolls columns; client recomputes filtered subset locally — no server round-trip per filter change.
6. PICK → `filter.pickRandom(filtered, lastPicked)` → board switches to `result` mode → letters animate in.
7. Reroll → same call with the just-picked film excluded. When the **filtered pool size is 1**, the Reroll button is disabled (there is nothing else to pick). Pool of 2 → consecutive rerolls ping-pong; acceptable.

### 4.5 External dependencies

- TMDB API key (free; environment variable `TMDB_API_KEY`).
- Vercel KV (free tier; env vars wired automatically when KV is added to the project).
- No auth, no DB, no user accounts. Only persistent state is the cached watchlist, keyed by Letterboxd handle.

## 5. Caching, Performance, and Progress UX

### 5.1 Cache

- Store: Vercel KV (Redis-compatible).
- Key: `wl:v1:<lowercase-username>`. The `v1:` prefix lets us invalidate everyone if the data shape changes.
- Value: `{ films: Film[], scrapedAt: number, sourceCount: number }` where `sourceCount` is the total films seen on Letterboxd (so we can detect partial-enrichment skew).
- TTL: 6 hours. Long enough for instant rerolls and revisits; short enough that newly-added watchlist items appear the same day.
- Lazy refresh — TTL expiry triggers a fresh scrape on next request, not a background job.
- Manual override: a small `↻ refresh watchlist` link near the username. Sends `?refresh=1`, forces a re-scrape, rewrites the cache.

### 5.2 Concurrency and rate limits

- Letterboxd watchlist pagination: serial, one page at a time, 200ms delay between pages. ~28 films per page.
- Per-film enrichment: parallel pool of 10. TMDB allows 50 req/s; we stay well under.
- Each film: 1 TMDB search + 1 Letterboxd film-page fetch. ~2 requests per film.
- **TMDB lookup failure** (404, malformed response, or 5xx after one retry): film is dropped from the enriched output. Without TMDB metadata we cannot filter by genre/decade and have no poster/synopsis to display, so the film cannot participate in the experience.
- **Letterboxd film-page rating fetch failure** (timeout > 5s, or 5xx after one retry): film is kept with `lbxRating: null`. Film passes through filters except when `minRating > 0` (i.e., the user has explicitly required some rating).
- Retries: one retry on 5xx with 500ms backoff for both upstreams.

### 5.3 Streaming progress (NDJSON)

Route Handler returns `Content-Type: application/x-ndjson`. Event shapes:

```ts
{ type: 'paginated', total: 312 }                                  // sent once after pagination
{ type: 'progress', loaded: 47, total: 312 }                       // every 5 films enriched
{ type: 'done', films: Film[] }                                    // terminal success
{ type: 'error', code: 'PRIVATE'|'NOT_FOUND'|'EMPTY'|'RATE_LIMIT'|'NETWORK'|'PARSER' }  // terminal error
```

Client mapping:
- Submit → board enters `loading` mode immediately, footer: `LOADING — FETCHING WATCHLIST`.
- `paginated` → footer: `LOADING · 0 / 312`.
- `progress` → counter ticks (throttled to every 5 films to avoid 30Hz re-renders).
- `done` → board → `filter` mode; columns populate.

### 5.4 Performance budgets

- First-time username, ≤500 films: target ≤30s. ≤1000 films: target ≤60s. PICK stays dimmed during loading.
- Cache hit: target ≤300ms (single KV read).
- KV cold start on Vercel free tier: ~200ms. Acceptable.
- Each enriched film ~600 bytes JSON. 500 films ≈ 300KB. Ship full list to client; filter logic stays client-side.
- Posters use TMDB CDN URLs at `w342` size. We do not proxy; no bandwidth cost.

### 5.5 Concurrent-submit handling

Submitting a fresh username while a previous scrape is in flight aborts the previous request via `AbortController`. The route handler does not write to KV unless the stream completes. Partial caches are worse than no cache.

## 6. Error Handling and Edge Cases

The cinema-marquee aesthetic gives error states a vocabulary: real marquees announce closures on the same board they advertise films. The board itself is the messenger.

### 6.1 Input validation (client-side, instant)

- Empty username → submit button disabled.
- Pasted URL like `letterboxd.com/foo/` or `@foo` → strip prefix/host, normalize to lowercase. Don't reject; clean.
- Username regex (post-normalization): `^[a-z0-9_]{2,15}$`. Anything else: inline red rule under input + `INVALID HANDLE` mono caps. Don't hit server.

### 6.2 Server-side error states

| Condition | Detection | Board message | Recovery |
|---|---|---|---|
| Username not found | Letterboxd `/<user>/` returns 404 | `NO SUCH / PATRON.` + `@foo IS NOT ON LETTERBOXD` | Refocus username input |
| Private watchlist | `/<user>/watchlist/` returns 403 or redirects to login | `PRIVATE / SCREENING.` + `@foo's WATCHLIST IS NOT PUBLIC` | Link to "How to make watchlist public" |
| Empty watchlist | Pagination returns 0 films on page 1 | `EMPTY / QUEUE.` + `@foo's WATCHLIST HAS NO FILMS YET` | Link to Letterboxd to add films |
| Letterboxd rate limit | Any scrape returns 429 | `BOX OFFICE / CLOSED.` + `LETTERBOXD IS RATE-LIMITING US — TRY AGAIN IN A MINUTE` | Auto-retry button after 60s countdown |
| Network / 5xx | Scrape or TMDB unreachable after 1 retry | `INTERMISSION.` + `SOMETHING WENT WRONG · CHECK YOUR CONNECTION` | `↻ TRY AGAIN` button |
| Parser broke | `cheerio` selector returns null where it shouldn't | Same as transient. Logs URL+selector server-side. | Same. We patch from logs. |
| KV unavailable | KV write/read throws | Not surfaced to user. Continue without cache. Log it. | Transparent |

### 6.3 Filter dead-ends

- Zero films match → PICK dims, footer: `0 FILMS MATCH — LOOSEN FILTERS` in amber. No modal, no toast.
- Optional polish (cut if implementation drags): when a filter column would have only one valid value given the others (e.g., only one decade has any 4★+ horror), unreachable values dim but stay scrollable.

### 6.4 Reroll edge cases

- Filtered pool of 1 → Reroll disabled with tooltip `ONLY ONE FILM MATCHES`.
- Reroll exclusion remembers only the last picked film. Pool of 2 ping-pongs honestly. Pool of 3+ feels random.

### 6.5 State persistence (intentionally minimal)

- No localStorage for filter state. Fresh load = defaults (genre `ANY`, decade `ANY`, min rating `★ 0+`).
- Last-typed username persists to localStorage for autofill on revisit. One concession to ergonomics.
- Cache lives server-side. Page is otherwise stateless. Refresh is safe.

### 6.6 Accessibility

- Each filter column: `role="listbox"` with arrow-key navigation, visible focus ring.
- Reveal animation respects `prefers-reduced-motion: reduce` → letters appear instantly.
- All board text is real DOM text (not images). Screen-reader friendly.
- Color contrast: cream/ink (~16:1) and board cream-on-black (~13:1). Both pass AAA.

## 7. Testing

Tooling: **Vitest** (unit + integration) · **React Testing Library** · **MSW** (mocked Letterboxd and TMDB responses) · **Playwright** (one E2E smoke test).

### 7.1 What gets tested (priority order)

1. **`lib/filter.ts`** — exhaustive pure unit tests.
   - `applyFilters` covers each filter individually, all three combined, `ANY` passthrough, empty input, films with `null` rating excluded only when `minRating > 0`.
   - `pickRandom` is deterministic via injected seeded RNG. Single-film pool returns it. Empty pool throws. Caller is responsible for disabling Reroll on pool-of-1; this is documented in code.

2. **`lib/letterboxd.ts`** — fixture-based parser tests. Save real Letterboxd HTML in `tests/fixtures/letterboxd/`:
   - `watchlist-page.html` (normal page, 28 films)
   - `film-the-thing.html` (film page with rating)
   - `user-not-found.html` (404)
   - `watchlist-private.html` (private redirect)

   Parser tests load fixture string, assert parsed shape. **These are the canary for Letterboxd HTML changes.**

3. **`lib/tmdb.ts`** — MSW-mocked tests. Hit (returns enriched film), miss (returns null, doesn't throw), malformed response (returns null). Don't test TMDB itself.

4. **`lib/enrich.ts`** — small integration test. Mock both modules, feed 5-film stub list:
   - All 5 enrich in parallel; output preserves order.
   - One TMDB miss → film excluded.
   - One Letterboxd-rating timeout → film present with `lbxRating: null`.
   - Streaming progress callback fires with monotonically increasing `loaded`.

5. **`app/api/watchlist/route.ts`** — one happy-path integration test. MSW-mocks upstreams. Asserts NDJSON stream contains `paginated`, `progress`, `done` in order.

6. **`LetterBoard` component** — three component tests for non-trivial UI logic:
   - Filter mode: scroll-up changes column value.
   - Loading mode: progress prop renders `LOADING · 47 / 312`.
   - Result mode: title prop renders letters split into expected grid.
   - Don't test the wood frame or pinstripes.

7. **One Playwright E2E test.** Against a known stable public watchlist (small, controlled, or mocked at the network layer). Steps: load page, type username, wait for filter mode, click PICK, assert a film is shown. Catches deploys broken by upstream HTML changes.

### 7.2 What we explicitly do NOT test

- Tailwind classes, CSS values, animation timing — visual concerns; eyeballs are cheaper than tests.
- `Header.tsx`, `PickButton.tsx`, `UsernameInput.tsx` rendering — too trivial; covered transitively by E2E.
- Reduced-motion behavior beyond a single assertion that the slide-in CSS is gated by the media query.
- `lib/cache.ts` beyond round-trip happy path. KV is a thin wrapper; route-level integration is what matters.

### 7.3 CI

- Vitest on every push (~3s).
- Playwright on PRs to main (~30s).
- Both block merge.

### 7.4 Manual QA before launch

Test against 3 real public Letterboxd accounts of different sizes (small <50 films, medium ~200, large >500) and one private profile to confirm error UX. Mobile Safari + Chrome desktop minimum.

## 8. Out of Scope (YAGNI)

These are tempting but explicitly *not* in this build. If they sneak into the implementation plan, kill them on sight.

- Letterboxd authentication or OAuth.
- Deep-linking shareable picks ("here's tonight's film for @foo").
- History of past picks.
- "I watched it" → mark in Letterboxd.
- Streaming-availability lookup (JustWatch, etc.).
- User accounts, saved filter presets.
- Dark mode.
- i18n.
- More filter dimensions (cast, director, language, country).

## 9. Assumptions

- The user has a **public Letterboxd profile** with a **public watchlist**. Private profiles are surfaced as a friendly error, not silently failed.
- TMDB title+year search is reliable enough for the long tail. Films that fail TMDB lookup are excluded from the filterable pool (logged but not surfaced to the user).
- "Min Rating" filter is the **Letterboxd community average rating** (the 0–5 stars on the film page). User's own rating doesn't apply here since these are unwatched films.
- Letterboxd will not block our scraper. Polite serial pagination + low concurrency on film pages should keep us under the radar. If they 429 us, we surface it (Section 6.2). If they fully block us, we're dead in the water — that risk is accepted.
- Vercel free tier is sufficient. KV free tier is sufficient. TMDB free tier is sufficient.

## 10. Open Questions

None blocking. The following are minor polish decisions to make during implementation:

- Should the unreachable-filter-values dim-but-scrollable behavior (Section 6.3) ship in v1 or v1.1? Default: v1.1 unless trivially cheap.
- Should the thud sound on letter-reveal ship at all, or wait for user demand? Default: ship as opt-in (toggle in colophon). Cost is one short audio asset.
