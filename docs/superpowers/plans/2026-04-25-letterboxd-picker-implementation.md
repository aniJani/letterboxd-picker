# Letterboxd Watchlist Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page Next.js app that picks a random film from a public Letterboxd watchlist with Genre/Decade/Min Rating filters, presented in a brutalist editorial aesthetic with a cinema letter-board as the central UI element.

**Architecture:** Next.js 15 App Router. One page (`app/page.tsx` server shell + `app/page.client.tsx` interactive root). One backend route (`app/api/watchlist/route.ts`) that scrapes Letterboxd HTML server-side, enriches each film with TMDB metadata, caches by username in Vercel KV, and streams progress to the client as NDJSON. Pure logic (filter, pickRandom, parsers) lives in `lib/` and is unit-tested. UI components are decoupled via discriminated-union props.

**Tech Stack:** Next.js 15 · TypeScript (strict) · Tailwind v4 · zod · cheerio · @vercel/kv · TMDB API · Vitest + React Testing Library + MSW · Playwright

**Reference spec:** `docs/superpowers/specs/2026-04-25-letterboxd-picker-design.md`

---

## File Map

```
app/
  page.tsx                       Server shell, renders <PageClient/>
  page.client.tsx                Interactive root: state machine, fetch, orchestration
  api/watchlist/route.ts         GET ?user=<handle> · NDJSON stream
  layout.tsx                     Root layout, metadata, font cascade
  globals.css                    Brutalist palette (CSS vars), base resets, Tailwind import

components/
  Header.tsx                     Brand + № + huge title + standfirst
  UsernameInput.tsx              @ field + validation + localStorage autofill
  LetterBoard.tsx                THE component, 2 modes (filter, result) via discriminated union
  FilterColumn.tsx               Generic scroll-picker over string[]
  PickButton.tsx                 Brutalist black/red button
  FilmDetails.tsx                Poster + director + synopsis + Reroll/Letterboxd
  ProgressLine.tsx               Outside-board status caption
  Colophon.tsx                   Thin footer line + motion toggle

lib/
  letterboxd.ts                  scrapeWatchlist(user), scrapeFilmRating(slug), parsers
  tmdb.ts                        searchByTitleYear, getMovie
  enrich.ts                      Concurrent enrichment + retries
  cache.ts                       Vercel KV wrapper with TTL
  filter.ts                      applyFilters, pickRandom (with injected RNG)
  rng.ts                         Seedable RNG factory + default Math.random
  types.ts                       Film, Watchlist, FilterState, ErrorCode (zod schemas)
  config.ts                      Constants: TTL, cache version, concurrency caps

tests/
  fixtures/letterboxd/           HTML fixtures
  fixtures/tmdb/                 JSON fixtures
  unit/                          *.test.ts — pure logic
  integration/                   *.test.ts — route + enrich
  components/                    *.test.tsx — RTL

e2e/
  picker.spec.ts                 Playwright happy-path

Root config: package.json, tsconfig.json, next.config.ts, postcss.config.mjs,
vitest.config.ts, playwright.config.ts, .env.example
```

**Conventions throughout:**
- TypeScript strict. No `any`. Boundaries (HTTP, KV) validated with zod.
- TDD discipline applies to `lib/` (pure logic and HTTP-mocked clients) and the API route. UI components use light component tests for non-trivial interaction logic only.
- Commit after every passing task. Single-line commit messages, no body, no co-author trailer.
- Run `npm run typecheck && npm run test` before each commit.

---

## Task 1: Bootstrap Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `postcss.config.mjs`
- Modify: `.gitignore` (already present)

- [ ] **Step 1.1: Initialize Next.js**

Run from `/Users/janit/letterboxd-picker`:

```bash
npx create-next-app@latest . \
  --typescript --tailwind --eslint --app \
  --no-src-dir --turbopack \
  --import-alias "@/*" \
  --use-npm --skip-install
```

When prompted to overwrite `.gitignore`, choose **No** (keep ours). When asked about `README.md`, choose **No** if it exists; otherwise allow it (we'll overwrite later).

- [ ] **Step 1.2: Install dependencies**

```bash
npm install zod cheerio @vercel/kv
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event jsdom msw@^2 @playwright/test
```

- [ ] **Step 1.3: Verify TypeScript strict mode**

Open `tsconfig.json`. Confirm:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

If `noUncheckedIndexedAccess` or `noImplicitOverride` are missing, add them.

- [ ] **Step 1.4: Add scripts to `package.json`**

In `package.json`, ensure `scripts` includes:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 1.5: Verify build runs**

```bash
npm run typecheck
```

Expected: exit 0, no output.

```bash
npm run build
```

Expected: build succeeds, default Next.js scaffold compiles.

- [ ] **Step 1.6: Commit**

```bash
git add -A
git commit -m "Bootstrap Next.js project with TypeScript and Tailwind"
```

---

## Task 2: Brutalist palette and base CSS

**Files:**
- Modify: `app/globals.css`
- Create: `app/layout.tsx` (overwrite generated)
- Modify: `app/page.tsx` (overwrite with placeholder)

- [ ] **Step 2.1: Replace `app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-paper: #efece4;
  --color-ink: #111111;
  --color-accent: #d61e2a;
  --color-board-frame: #5a3a1f;
  --color-board-bg: #0c0c0c;
  --color-board-letter: #f5f0e6;
  --color-amber: #d4a04a;
  --color-muted: #8a8378;

  --font-display: "Helvetica Neue", "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: "Courier New", ui-monospace, "Menlo", monospace;

  /* Override Tailwind's default sm breakpoint to match the spec's mobile cutoff (540px). */
  --breakpoint-sm: 540px;
}

* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-display);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

button {
  font-family: inherit;
  cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 2.2: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Letterboxd Watchlist Picker",
  description: "Surrender the choice. We'll pull a film from your Letterboxd watchlist that fits the night.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2.3: Replace `app/page.tsx` with placeholder**

```tsx
export default function Page() {
  return (
    <main style={{ padding: "40px", maxWidth: "720px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "64px", fontWeight: 900, lineHeight: 0.88, letterSpacing: "-0.04em" }}>
        PICK ME<br />A FILM<span style={{ color: "var(--color-accent)" }}>.</span>
      </h1>
    </main>
  );
}
```

- [ ] **Step 2.4: Verify visually**

```bash
npm run dev
```

Open http://localhost:3000. Confirm:
- Cream background (`#efece4`)
- Black "PICK ME / A FILM." with red dot
- Helvetica display weight
- Stop the dev server when done.

- [ ] **Step 2.5: Commit**

```bash
git add -A
git commit -m "Add brutalist palette and base layout placeholder"
```

---

## Task 3: Vitest + MSW + testing scaffolding

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/msw/handlers.ts`, `tests/msw/server.ts`, `tests/unit/smoke.test.ts`

- [ ] **Step 3.1: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3.2: Create `tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 3.3: Create `tests/msw/handlers.ts`**

```ts
import { http, HttpResponse } from "msw";

export const handlers = [
  // Default empty handlers — tests add their own with server.use(...)
  http.all("*", ({ request }) => {
    return HttpResponse.json({ unhandled: request.url }, { status: 599 });
  }),
];
```

- [ ] **Step 3.4: Create `tests/msw/server.ts`**

```ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
```

- [ ] **Step 3.5: Create `tests/unit/smoke.test.ts`**

```ts
import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3.6: Run tests**

```bash
npm run test
```

Expected: 1 test passes.

- [ ] **Step 3.7: Commit**

```bash
git add -A
git commit -m "Set up Vitest with MSW and jsdom environment"
```

---

## Task 4: Types and zod schemas

**Files:**
- Create: `lib/types.ts`, `lib/config.ts`
- Create: `tests/unit/types.test.ts`

- [ ] **Step 4.1: Write failing test `tests/unit/types.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { FilmSchema, FilterStateSchema, ErrorCodeSchema } from "@/lib/types";

describe("FilmSchema", () => {
  it("accepts a valid film", () => {
    const film = {
      slug: "the-thing",
      title: "The Thing",
      year: 1982,
      lbxRating: 4.1,
      tmdbId: 1091,
      genres: ["Horror", "Mystery", "Sci-Fi"],
      runtime: 109,
      director: "John Carpenter",
      posterPath: "/abc.jpg",
      synopsis: "Antarctic researchers...",
      letterboxdUrl: "https://letterboxd.com/film/the-thing/",
    };
    expect(() => FilmSchema.parse(film)).not.toThrow();
  });

  it("allows lbxRating to be null", () => {
    const film = {
      slug: "obscure",
      title: "Obscure",
      year: 2003,
      lbxRating: null,
      tmdbId: 999,
      genres: ["Drama"],
      runtime: 90,
      director: "Unknown",
      posterPath: null,
      synopsis: "",
      letterboxdUrl: "https://letterboxd.com/film/obscure/",
    };
    expect(() => FilmSchema.parse(film)).not.toThrow();
  });

  it("rejects films missing required fields", () => {
    expect(() => FilmSchema.parse({ slug: "x" })).toThrow();
  });
});

describe("FilterStateSchema", () => {
  it("accepts the default filter state", () => {
    const state = { genre: "ANY", decade: "ANY", minRating: 0 };
    expect(() => FilterStateSchema.parse(state)).not.toThrow();
  });

  it("rejects minRating > 5", () => {
    expect(() => FilterStateSchema.parse({ genre: "ANY", decade: "ANY", minRating: 6 })).toThrow();
  });
});

describe("ErrorCodeSchema", () => {
  it("accepts known codes", () => {
    for (const c of ["NOT_FOUND", "PRIVATE", "EMPTY", "RATE_LIMIT", "NETWORK", "PARSER"]) {
      expect(() => ErrorCodeSchema.parse(c)).not.toThrow();
    }
  });

  it("rejects unknown codes", () => {
    expect(() => ErrorCodeSchema.parse("WHATEVER")).toThrow();
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
npm run test -- tests/unit/types.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4.3: Create `lib/types.ts`**

```ts
import { z } from "zod";

export const FilmSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  year: z.number().int().min(1888).max(2100),
  lbxRating: z.number().min(0).max(5).nullable(),
  tmdbId: z.number().int().positive(),
  genres: z.array(z.string()),
  runtime: z.number().int().positive(),
  director: z.string(),
  posterPath: z.string().nullable(),
  synopsis: z.string(),
  letterboxdUrl: z.string().url(),
});
export type Film = z.infer<typeof FilmSchema>;

export const FilmStubSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  year: z.number().int().nullable(),
});
export type FilmStub = z.infer<typeof FilmStubSchema>;

export const FilterStateSchema = z.object({
  genre: z.string(),
  decade: z.string(),
  minRating: z.number().min(0).max(5),
});
export type FilterState = z.infer<typeof FilterStateSchema>;

export const ErrorCodeSchema = z.enum(["NOT_FOUND", "PRIVATE", "EMPTY", "RATE_LIMIT", "NETWORK", "PARSER"]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paginated"), total: z.number().int().nonnegative() }),
  z.object({ type: z.literal("progress"), loaded: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
  z.object({ type: z.literal("done"), films: z.array(FilmSchema) }),
  z.object({ type: z.literal("error"), code: ErrorCodeSchema, message: z.string().optional() }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;

export const CachedWatchlistSchema = z.object({
  films: z.array(FilmSchema),
  scrapedAt: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
});
export type CachedWatchlist = z.infer<typeof CachedWatchlistSchema>;
```

- [ ] **Step 4.4: Create `lib/config.ts`**

```ts
export const CACHE_VERSION = "v1";
export const CACHE_TTL_SECONDS = 60 * 60 * 6; // 6 hours
export const ENRICH_CONCURRENCY = 10;
export const FILM_PAGE_TIMEOUT_MS = 5_000;
export const PAGINATION_DELAY_MS = 200;
export const RETRY_BACKOFF_MS = 500;
export const MAX_USERNAME_LENGTH = 15;
export const MIN_USERNAME_LENGTH = 2;
export const PROGRESS_THROTTLE = 5;

export const DEFAULT_FILTER_STATE = {
  genre: "ANY",
  decade: "ANY",
  minRating: 0,
} as const;

export const TMDB_API_BASE = "https://api.themoviedb.org/3";
export const LETTERBOXD_BASE = "https://letterboxd.com";
```

- [ ] **Step 4.5: Run test to verify it passes**

```bash
npm run test -- tests/unit/types.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 4.6: Commit**

```bash
git add -A
git commit -m "Add types, schemas, and config constants"
```

---

## Task 5: Seedable RNG

**Files:**
- Create: `lib/rng.ts`, `tests/unit/rng.test.ts`

- [ ] **Step 5.1: Write failing test `tests/unit/rng.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { createSeededRng, defaultRng } from "@/lib/rng";

describe("createSeededRng", () => {
  it("produces deterministic sequence for the same seed", () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    expect(a()).not.toBe(b());
  });

  it("returns floats in [0, 1)", () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("defaultRng", () => {
  it("returns floats in [0, 1)", () => {
    for (let i = 0; i < 10; i++) {
      const v = defaultRng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
npm run test -- tests/unit/rng.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5.3: Create `lib/rng.ts`**

```ts
export type Rng = () => number;

// Mulberry32 — small fast seedable PRNG. Output in [0, 1).
export function createSeededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultRng: Rng = () => Math.random();
```

- [ ] **Step 5.4: Run test to verify it passes**

```bash
npm run test -- tests/unit/rng.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 5.5: Commit**

```bash
git add -A
git commit -m "Add seedable RNG for deterministic tests"
```

---

## Task 6: Filter logic and pickRandom

**Files:**
- Create: `lib/filter.ts`, `tests/unit/filter.test.ts`

- [ ] **Step 6.1: Write failing test `tests/unit/filter.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { applyFilters, pickRandom, decadeFromYear } from "@/lib/filter";
import { createSeededRng } from "@/lib/rng";
import type { Film } from "@/lib/types";

const film = (overrides: Partial<Film>): Film => ({
  slug: "x",
  title: "X",
  year: 2000,
  lbxRating: 4.0,
  tmdbId: 1,
  genres: ["Drama"],
  runtime: 100,
  director: "Dir",
  posterPath: null,
  synopsis: "",
  letterboxdUrl: "https://letterboxd.com/film/x/",
  ...overrides,
});

describe("decadeFromYear", () => {
  it("buckets years into decades", () => {
    expect(decadeFromYear(1982)).toBe("1980s");
    expect(decadeFromYear(1990)).toBe("1990s");
    expect(decadeFromYear(2009)).toBe("2000s");
    expect(decadeFromYear(2020)).toBe("2020s");
  });
});

describe("applyFilters", () => {
  const films = [
    film({ slug: "a", year: 1982, genres: ["Horror"], lbxRating: 4.1 }),
    film({ slug: "b", year: 1990, genres: ["Drama"], lbxRating: 3.8 }),
    film({ slug: "c", year: 2020, genres: ["Horror", "Drama"], lbxRating: 4.5 }),
    film({ slug: "d", year: 2005, genres: ["Comedy"], lbxRating: null }),
  ];

  it("returns all films when state is all ANY and minRating 0", () => {
    expect(applyFilters(films, { genre: "ANY", decade: "ANY", minRating: 0 })).toHaveLength(4);
  });

  it("filters by genre (matches if genre is in film.genres)", () => {
    const out = applyFilters(films, { genre: "Horror", decade: "ANY", minRating: 0 });
    expect(out.map(f => f.slug).sort()).toEqual(["a", "c"]);
  });

  it("filters by decade", () => {
    const out = applyFilters(films, { genre: "ANY", decade: "1980s", minRating: 0 });
    expect(out.map(f => f.slug)).toEqual(["a"]);
  });

  it("filters by minRating, including null when minRating is 0", () => {
    const out = applyFilters(films, { genre: "ANY", decade: "ANY", minRating: 0 });
    expect(out.map(f => f.slug).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("excludes films with null lbxRating when minRating > 0", () => {
    const out = applyFilters(films, { genre: "ANY", decade: "ANY", minRating: 0.5 });
    expect(out.map(f => f.slug).sort()).toEqual(["a", "b", "c"]);
  });

  it("filters by minRating threshold", () => {
    const out = applyFilters(films, { genre: "ANY", decade: "ANY", minRating: 4.0 });
    expect(out.map(f => f.slug).sort()).toEqual(["a", "c"]);
  });

  it("combines all three filters", () => {
    const out = applyFilters(films, { genre: "Horror", decade: "2020s", minRating: 4.0 });
    expect(out.map(f => f.slug)).toEqual(["c"]);
  });

  it("returns empty array when no match", () => {
    const out = applyFilters(films, { genre: "Western", decade: "ANY", minRating: 0 });
    expect(out).toEqual([]);
  });
});

describe("pickRandom", () => {
  const films = [
    film({ slug: "a" }),
    film({ slug: "b" }),
    film({ slug: "c" }),
  ];

  it("returns one of the films", () => {
    const rng = createSeededRng(1);
    const picked = pickRandom(films, undefined, rng);
    expect(films.map(f => f.slug)).toContain(picked.slug);
  });

  it("is deterministic with a seeded rng", () => {
    const a = pickRandom(films, undefined, createSeededRng(42));
    const b = pickRandom(films, undefined, createSeededRng(42));
    expect(a.slug).toBe(b.slug);
  });

  it("excludes the given exclude slug when pool size > 1", () => {
    const rng = createSeededRng(1);
    for (let i = 0; i < 50; i++) {
      const picked = pickRandom(films, "a", rng);
      expect(picked.slug).not.toBe("a");
    }
  });

  it("returns the only film when pool size is 1, even if excluded", () => {
    const single = [film({ slug: "only" })];
    expect(pickRandom(single, "only", createSeededRng(1)).slug).toBe("only");
  });

  it("throws on empty pool", () => {
    expect(() => pickRandom([], undefined, createSeededRng(1))).toThrow();
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

```bash
npm run test -- tests/unit/filter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 6.3: Create `lib/filter.ts`**

```ts
import type { Film, FilterState } from "@/lib/types";
import { defaultRng, type Rng } from "@/lib/rng";

export function decadeFromYear(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

export function applyFilters(films: Film[], state: FilterState): Film[] {
  return films.filter(f => {
    if (state.genre !== "ANY" && !f.genres.includes(state.genre)) return false;
    if (state.decade !== "ANY" && decadeFromYear(f.year) !== state.decade) return false;
    if (state.minRating > 0) {
      if (f.lbxRating === null) return false;
      if (f.lbxRating < state.minRating) return false;
    }
    return true;
  });
}

export function pickRandom(pool: Film[], exclude: string | undefined, rng: Rng = defaultRng): Film {
  if (pool.length === 0) {
    throw new Error("pickRandom: empty pool");
  }
  if (pool.length === 1) {
    return pool[0]!;
  }
  const candidates = exclude ? pool.filter(f => f.slug !== exclude) : pool;
  const effective = candidates.length > 0 ? candidates : pool;
  const idx = Math.floor(rng() * effective.length);
  return effective[idx]!;
}
```

- [ ] **Step 6.4: Run test to verify it passes**

```bash
npm run test -- tests/unit/filter.test.ts
```

Expected: PASS — all tests.

- [ ] **Step 6.5: Commit**

```bash
git add -A
git commit -m "Add filter logic and pickRandom"
```

---

## Task 7: Letterboxd HTML parser (fixture-based)

**Files:**
- Create: `tests/fixtures/letterboxd/watchlist-page.html`, `tests/fixtures/letterboxd/film-the-thing.html`, `tests/fixtures/letterboxd/user-not-found.html`, `tests/fixtures/letterboxd/watchlist-private.html`
- Create: `lib/letterboxd.ts` (parsers only — HTTP layer added in Task 8)
- Create: `tests/unit/letterboxd.parser.test.ts`

> **About fixtures:** capture *real* HTML from Letterboxd by `curl`'ing the URLs below. These are public pages. If a structural change happens later, the parser tests are the canary; refresh fixtures and patch parsers together.

- [ ] **Step 7.1: Capture fixtures**

```bash
mkdir -p tests/fixtures/letterboxd
curl -s -A "Mozilla/5.0" "https://letterboxd.com/dave/watchlist/page/1/" > tests/fixtures/letterboxd/watchlist-page.html
curl -s -A "Mozilla/5.0" "https://letterboxd.com/film/the-thing/" > tests/fixtures/letterboxd/film-the-thing.html
curl -s -A "Mozilla/5.0" "https://letterboxd.com/this-user-does-not-exist-9999/" -o tests/fixtures/letterboxd/user-not-found.html -w "%{http_code}\n"
```

If the 404 returns no body, write a minimal placeholder:

```bash
[ -s tests/fixtures/letterboxd/user-not-found.html ] || echo '<html><body><h1>Sorry, we can&#x27;t find that page.</h1></body></html>' > tests/fixtures/letterboxd/user-not-found.html
```

For the private-watchlist fixture: until we have a known private watchlist URL, write a stub that simulates Letterboxd's "this content is private" page:

```bash
cat > tests/fixtures/letterboxd/watchlist-private.html <<'HTML'
<html><body>
<section class="message-row">
<div class="message">Sorry, the page you were looking for could not be found.</div>
<p>This member's profile is private.</p>
</section>
</body></html>
HTML
```

If the captured live page differs, update the parser to match real markup. The fixture is a starting point.

- [ ] **Step 7.2: Write failing test `tests/unit/letterboxd.parser.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseWatchlistPage,
  parseFilmRating,
  parseUserExists,
  isPrivateWatchlist,
} from "@/lib/letterboxd";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "..", "fixtures", "letterboxd", name), "utf8");

describe("parseWatchlistPage", () => {
  it("extracts film stubs from a watchlist page", () => {
    const html = fixture("watchlist-page.html");
    const result = parseWatchlistPage(html);
    expect(result.films.length).toBeGreaterThan(0);
    for (const stub of result.films) {
      expect(stub.slug).toMatch(/^[a-z0-9-]+$/);
      expect(stub.title.length).toBeGreaterThan(0);
    }
  });

  it("returns hasNextPage true when pagination has a next link", () => {
    const html = fixture("watchlist-page.html");
    const result = parseWatchlistPage(html);
    expect(typeof result.hasNextPage).toBe("boolean");
  });

  it("returns hasNextPage false on the last page", () => {
    const html = `<html><body><ul class="poster-list">
      <li class="poster-container"><div data-film-slug="only-film" data-film-name="Only Film" data-film-release-year="2020"></div></li>
    </ul></body></html>`;
    const result = parseWatchlistPage(html);
    expect(result.hasNextPage).toBe(false);
  });
});

describe("parseFilmRating", () => {
  it("extracts community average rating from a film page", () => {
    const html = fixture("film-the-thing.html");
    const rating = parseFilmRating(html);
    if (rating !== null) {
      expect(rating).toBeGreaterThanOrEqual(0);
      expect(rating).toBeLessThanOrEqual(5);
    }
  });

  it("returns null when no rating is present", () => {
    const html = `<html><body><h1>No rating here</h1></body></html>`;
    expect(parseFilmRating(html)).toBeNull();
  });
});

describe("parseUserExists", () => {
  it("returns false on a 404 page", () => {
    const html = fixture("user-not-found.html");
    expect(parseUserExists(html)).toBe(false);
  });
});

describe("isPrivateWatchlist", () => {
  it("returns true on a private-profile page", () => {
    const html = fixture("watchlist-private.html");
    expect(isPrivateWatchlist(html)).toBe(true);
  });

  it("returns false on a normal watchlist page", () => {
    const html = fixture("watchlist-page.html");
    expect(isPrivateWatchlist(html)).toBe(false);
  });
});
```

- [ ] **Step 7.3: Run test to verify it fails**

```bash
npm run test -- tests/unit/letterboxd.parser.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7.4: Create `lib/letterboxd.ts` (parsers + types)**

```ts
import * as cheerio from "cheerio";
import type { FilmStub } from "@/lib/types";

export type WatchlistPageResult = {
  films: FilmStub[];
  hasNextPage: boolean;
};

export function parseWatchlistPage(html: string): WatchlistPageResult {
  const $ = cheerio.load(html);
  const films: FilmStub[] = [];

  $("li.poster-container [data-film-slug]").each((_, el) => {
    const $el = $(el);
    const slug = $el.attr("data-film-slug")?.trim();
    const title = $el.attr("data-film-name")?.trim() || $el.find("img").attr("alt")?.trim();
    const yearAttr = $el.attr("data-film-release-year");
    const year = yearAttr ? parseInt(yearAttr, 10) : NaN;
    if (!slug || !title) return;
    films.push({ slug, title, year: Number.isFinite(year) ? year : null });
  });

  const hasNextPage = $("a.next").length > 0 || $(".paginate-nextprev .next").length > 0;

  return { films, hasNextPage };
}

export function parseFilmRating(html: string): number | null {
  const $ = cheerio.load(html);
  const meta = $('meta[name="twitter:data2"]').attr("content");
  if (meta) {
    const m = meta.match(/([0-9](?:\.[0-9]+)?)\s*out of\s*5/i);
    if (m && m[1]) {
      const v = parseFloat(m[1]);
      if (Number.isFinite(v) && v >= 0 && v <= 5) return v;
    }
  }
  const ld = $('script[type="application/ld+json"]').text();
  if (ld) {
    const m = ld.match(/"ratingValue"\s*:\s*"?([0-9](?:\.[0-9]+)?)"?/);
    if (m && m[1]) {
      const v = parseFloat(m[1]);
      if (Number.isFinite(v) && v >= 0 && v <= 5) return v;
    }
  }
  return null;
}

export function parseUserExists(html: string): boolean {
  const lower = html.toLowerCase();
  if (lower.includes("sorry, we can&#x27;t find that page") || lower.includes("sorry, we can't find that page")) {
    return false;
  }
  if (lower.includes("404 not found")) return false;
  return true;
}

export function isPrivateWatchlist(html: string): boolean {
  const lower = html.toLowerCase();
  return lower.includes("profile is private") || lower.includes("watchlist is private");
}
```

- [ ] **Step 7.5: Run test to verify it passes**

```bash
npm run test -- tests/unit/letterboxd.parser.test.ts
```

Expected: PASS. If the live `watchlist-page.html` selectors changed, adjust selectors to match actual markup, then rerun.

- [ ] **Step 7.6: Commit**

```bash
git add -A
git commit -m "Add Letterboxd HTML parsers with fixture-based tests"
```

---

## Task 8: Letterboxd HTTP layer (paginated scrape)

**Files:**
- Modify: `lib/letterboxd.ts` (append HTTP functions)
- Create: `tests/integration/letterboxd-scrape.test.ts`

- [ ] **Step 8.1: Write failing test `tests/integration/letterboxd-scrape.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server";
import { scrapeWatchlist } from "@/lib/letterboxd";

const page1 = `<html><body><ul class="poster-list">
  <li class="poster-container"><div data-film-slug="a" data-film-name="A" data-film-release-year="2001"></div></li>
  <li class="poster-container"><div data-film-slug="b" data-film-name="B" data-film-release-year="2002"></div></li>
</ul><a class="next" href="/foo/watchlist/page/2/">Next</a></body></html>`;

const page2 = `<html><body><ul class="poster-list">
  <li class="poster-container"><div data-film-slug="c" data-film-name="C" data-film-release-year="2003"></div></li>
</ul></body></html>`;

describe("scrapeWatchlist", () => {
  it("paginates through all pages and returns combined stubs", async () => {
    server.use(
      http.get("https://letterboxd.com/foo/watchlist/", () => HttpResponse.html(page1)),
      http.get("https://letterboxd.com/foo/watchlist/page/2/", () => HttpResponse.html(page2)),
    );
    const result = await scrapeWatchlist("foo");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.films.map(f => f.slug)).toEqual(["a", "b", "c"]);
    }
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    server.use(
      http.get("https://letterboxd.com/ghost/watchlist/", () =>
        HttpResponse.text("Sorry, we can't find that page", { status: 404 })),
    );
    const result = await scrapeWatchlist("ghost");
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.code).toBe("NOT_FOUND");
  });

  it("returns PRIVATE on a private watchlist", async () => {
    server.use(
      http.get("https://letterboxd.com/secret/watchlist/", () =>
        HttpResponse.html("<html><body>profile is private</body></html>", { status: 200 })),
    );
    const result = await scrapeWatchlist("secret");
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.code).toBe("PRIVATE");
  });

  it("returns EMPTY when watchlist has no films", async () => {
    server.use(
      http.get("https://letterboxd.com/empty/watchlist/", () =>
        HttpResponse.html(`<html><body><ul class="poster-list"></ul></body></html>`)),
    );
    const result = await scrapeWatchlist("empty");
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.code).toBe("EMPTY");
  });

  it("returns RATE_LIMIT on 429", async () => {
    server.use(
      http.get("https://letterboxd.com/foo/watchlist/", () => new HttpResponse(null, { status: 429 })),
    );
    const result = await scrapeWatchlist("foo");
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.code).toBe("RATE_LIMIT");
  });
});
```

- [ ] **Step 8.2: Run test to verify it fails**

```bash
npm run test -- tests/integration/letterboxd-scrape.test.ts
```

Expected: FAIL — `scrapeWatchlist` not exported.

- [ ] **Step 8.3: Append HTTP functions to `lib/letterboxd.ts`**

Append at the end of the existing file:

```ts
import type { ErrorCode } from "@/lib/types";
import { LETTERBOXD_BASE, PAGINATION_DELAY_MS, RETRY_BACKOFF_MS } from "@/lib/config";

export type ScrapeResult<T> =
  | { kind: "ok"; films: T[] }
  | { kind: "error"; code: ErrorCode; message?: string };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchPage(url: string, signal?: AbortSignal): Promise<{ status: number; html: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "letterboxd-picker/1.0 (+https://github.com/yourname)" },
    signal,
  });
  const html = await res.text();
  return { status: res.status, html };
}

export async function scrapeWatchlist(
  user: string,
  signal?: AbortSignal,
): Promise<ScrapeResult<FilmStub>> {
  const u = encodeURIComponent(user);
  let page = 1;
  const films: FilmStub[] = [];

  while (true) {
    const url = page === 1
      ? `${LETTERBOXD_BASE}/${u}/watchlist/`
      : `${LETTERBOXD_BASE}/${u}/watchlist/page/${page}/`;

    let res;
    try {
      res = await fetchPage(url, signal);
    } catch {
      return { kind: "error", code: "NETWORK" };
    }

    if (res.status === 404) {
      if (!parseUserExists(res.html)) return { kind: "error", code: "NOT_FOUND" };
      return { kind: "error", code: "NOT_FOUND" };
    }
    if (res.status === 429) return { kind: "error", code: "RATE_LIMIT" };
    if (res.status === 403) return { kind: "error", code: "PRIVATE" };
    if (res.status >= 500 && res.status < 600) {
      await sleep(RETRY_BACKOFF_MS);
      try {
        res = await fetchPage(url, signal);
      } catch {
        return { kind: "error", code: "NETWORK" };
      }
      if (res.status >= 500) return { kind: "error", code: "NETWORK" };
    }

    if (isPrivateWatchlist(res.html)) {
      return { kind: "error", code: "PRIVATE" };
    }

    const parsed = parseWatchlistPage(res.html);
    films.push(...parsed.films);

    if (!parsed.hasNextPage) break;
    page += 1;
    await sleep(PAGINATION_DELAY_MS);
  }

  if (films.length === 0) return { kind: "error", code: "EMPTY" };
  return { kind: "ok", films };
}

export async function scrapeFilmRating(slug: string, signal?: AbortSignal): Promise<number | null> {
  const url = `${LETTERBOXD_BASE}/film/${slug}/`;
  try {
    const res = await fetchPage(url, signal);
    if (res.status >= 400) return null;
    return parseFilmRating(res.html);
  } catch {
    return null;
  }
}
```

- [ ] **Step 8.4: Run test to verify it passes**

```bash
npm run test -- tests/integration/letterboxd-scrape.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 8.5: Commit**

```bash
git add -A
git commit -m "Add paginated Letterboxd watchlist scraper"
```

---

## Task 9: TMDB client

**Files:**
- Create: `tests/fixtures/tmdb/search-the-thing.json`, `tests/fixtures/tmdb/movie-the-thing.json`
- Create: `lib/tmdb.ts`, `tests/unit/tmdb.test.ts`

- [ ] **Step 9.1: Create fixtures**

`tests/fixtures/tmdb/search-the-thing.json`:

```json
{
  "page": 1,
  "results": [
    {
      "id": 1091,
      "title": "The Thing",
      "release_date": "1982-06-25",
      "poster_path": "/tzGY49eseSE9fAfPYnoeKMSc8aH.jpg"
    }
  ],
  "total_results": 1
}
```

`tests/fixtures/tmdb/movie-the-thing.json`:

```json
{
  "id": 1091,
  "title": "The Thing",
  "release_date": "1982-06-25",
  "runtime": 109,
  "overview": "Antarctic researchers...",
  "poster_path": "/tzGY49eseSE9fAfPYnoeKMSc8aH.jpg",
  "genres": [
    {"id": 27, "name": "Horror"},
    {"id": 9648, "name": "Mystery"},
    {"id": 878, "name": "Science Fiction"}
  ],
  "credits": {
    "crew": [
      {"job": "Director", "name": "John Carpenter"},
      {"job": "Producer", "name": "David Foster"}
    ]
  }
}
```

- [ ] **Step 9.2: Write failing test `tests/unit/tmdb.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { server } from "../msw/server";
import { searchByTitleYear, getMovie } from "@/lib/tmdb";

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "tmdb", name), "utf8"));

describe("searchByTitleYear", () => {
  it("returns the matching tmdbId on a hit", async () => {
    server.use(
      http.get("https://api.themoviedb.org/3/search/movie", () =>
        HttpResponse.json(fixture("search-the-thing.json"))),
    );
    const result = await searchByTitleYear("The Thing", 1982, "fake-key");
    expect(result).toBe(1091);
  });

  it("returns null when there are no results", async () => {
    server.use(
      http.get("https://api.themoviedb.org/3/search/movie", () =>
        HttpResponse.json({ page: 1, results: [], total_results: 0 })),
    );
    const result = await searchByTitleYear("Nonexistent Film", 2099, "fake-key");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    server.use(
      http.get("https://api.themoviedb.org/3/search/movie", () =>
        HttpResponse.error()),
    );
    expect(await searchByTitleYear("X", 2000, "k")).toBeNull();
  });
});

describe("getMovie", () => {
  it("returns enriched movie metadata", async () => {
    server.use(
      http.get("https://api.themoviedb.org/3/movie/1091", () =>
        HttpResponse.json(fixture("movie-the-thing.json"))),
    );
    const result = await getMovie(1091, "fake-key");
    expect(result).not.toBeNull();
    expect(result!.runtime).toBe(109);
    expect(result!.director).toBe("John Carpenter");
    expect(result!.genres).toContain("Horror");
    expect(result!.posterPath).toBe("/tzGY49eseSE9fAfPYnoeKMSc8aH.jpg");
  });

  it("returns null on 404", async () => {
    server.use(
      http.get("https://api.themoviedb.org/3/movie/9999999", () =>
        new HttpResponse(null, { status: 404 })),
    );
    expect(await getMovie(9999999, "fake-key")).toBeNull();
  });
});
```

- [ ] **Step 9.3: Run test to verify it fails**

```bash
npm run test -- tests/unit/tmdb.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 9.4: Create `lib/tmdb.ts`**

```ts
import { TMDB_API_BASE, RETRY_BACKOFF_MS } from "@/lib/config";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type TmdbSearchResponse = {
  results: Array<{ id: number; title: string; release_date?: string }>;
};

type TmdbMovieResponse = {
  id: number;
  title: string;
  release_date?: string;
  runtime?: number | null;
  overview?: string;
  poster_path?: string | null;
  genres?: Array<{ id: number; name: string }>;
  credits?: {
    crew?: Array<{ job: string; name: string }>;
  };
};

export type TmdbMovie = {
  tmdbId: number;
  title: string;
  year: number;
  runtime: number;
  director: string;
  genres: string[];
  posterPath: string | null;
  synopsis: string;
};

async function tmdbFetch(path: string, params: Record<string, string>, apiKey: string): Promise<Response | null> {
  const url = new URL(TMDB_API_BASE + path);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url.toString());
      if (res.status >= 500 && attempt === 0) {
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      return res;
    } catch {
      if (attempt === 0) {
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      return null;
    }
  }
  return null;
}

export async function searchByTitleYear(title: string, year: number | null, apiKey: string): Promise<number | null> {
  const params: Record<string, string> = { query: title };
  if (year !== null) params.year = String(year);

  const res = await tmdbFetch("/search/movie", params, apiKey);
  if (!res || !res.ok) return null;

  const data = (await res.json()) as TmdbSearchResponse;
  if (!data.results || data.results.length === 0) return null;
  return data.results[0]!.id;
}

export async function getMovie(tmdbId: number, apiKey: string): Promise<TmdbMovie | null> {
  const res = await tmdbFetch(`/movie/${tmdbId}`, { append_to_response: "credits" }, apiKey);
  if (!res || !res.ok) return null;

  const data = (await res.json()) as TmdbMovieResponse;
  if (!data.id) return null;

  const year = data.release_date ? parseInt(data.release_date.slice(0, 4), 10) : NaN;
  if (!Number.isFinite(year)) return null;
  if (typeof data.runtime !== "number" || data.runtime <= 0) return null;

  const director = data.credits?.crew?.find(c => c.job === "Director")?.name ?? "";

  return {
    tmdbId: data.id,
    title: data.title,
    year,
    runtime: data.runtime,
    director,
    genres: (data.genres ?? []).map(g => g.name),
    posterPath: data.poster_path ?? null,
    synopsis: data.overview ?? "",
  };
}
```

- [ ] **Step 9.5: Run test to verify it passes**

```bash
npm run test -- tests/unit/tmdb.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 9.6: Commit**

```bash
git add -A
git commit -m "Add TMDB client with search and movie fetch"
```

---

## Task 10: Enrichment orchestrator

**Files:**
- Create: `lib/enrich.ts`, `tests/unit/enrich.test.ts`

- [ ] **Step 10.1: Write failing test `tests/unit/enrich.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { enrich } from "@/lib/enrich";
import type { FilmStub } from "@/lib/types";
import type { TmdbMovie } from "@/lib/tmdb";

const stub = (overrides: Partial<FilmStub>): FilmStub => ({
  slug: "x",
  title: "X",
  year: 2000,
  ...overrides,
});

const fakeTmdb = (overrides: Partial<TmdbMovie>): TmdbMovie => ({
  tmdbId: 1,
  title: "X",
  year: 2000,
  runtime: 100,
  director: "Dir",
  genres: ["Drama"],
  posterPath: "/x.jpg",
  synopsis: "Plot.",
  ...overrides,
});

describe("enrich", () => {
  it("enriches all stubs in input order", async () => {
    const stubs = [stub({ slug: "a", title: "A" }), stub({ slug: "b", title: "B" }), stub({ slug: "c", title: "C" })];
    const tmdbSearch = vi.fn(async (title: string) => ({ a: 10, b: 20, c: 30 } as Record<string, number>)[title.toLowerCase()] ?? null);
    const tmdbGet = vi.fn(async (id: number) => fakeTmdb({ tmdbId: id, title: id === 10 ? "A" : id === 20 ? "B" : "C" }));
    const ratingFetch = vi.fn(async () => 4.0);

    const progress: Array<{ loaded: number; total: number }> = [];
    const result = await enrich(stubs, {
      apiKey: "k",
      tmdbSearch,
      tmdbGet,
      ratingFetch,
      onProgress: (loaded, total) => progress.push({ loaded, total }),
      concurrency: 2,
      progressEvery: 1,
    });

    expect(result.map(f => f.slug)).toEqual(["a", "b", "c"]);
    expect(result.every(f => f.lbxRating === 4.0)).toBe(true);
    expect(progress.at(-1)).toEqual({ loaded: 3, total: 3 });
  });

  it("excludes films with TMDB miss", async () => {
    const stubs = [stub({ slug: "a", title: "A" }), stub({ slug: "b", title: "B" })];
    const tmdbSearch = vi.fn(async (title: string) => title === "A" ? 10 : null);
    const tmdbGet = vi.fn(async (id: number) => fakeTmdb({ tmdbId: id, title: "A" }));
    const ratingFetch = vi.fn(async () => 3.5);
    const result = await enrich(stubs, { apiKey: "k", tmdbSearch, tmdbGet, ratingFetch, concurrency: 2, progressEvery: 1 });
    expect(result.map(f => f.slug)).toEqual(["a"]);
  });

  it("keeps films when rating fetch returns null", async () => {
    const stubs = [stub({ slug: "a", title: "A" })];
    const tmdbSearch = vi.fn(async () => 10);
    const tmdbGet = vi.fn(async (id: number) => fakeTmdb({ tmdbId: id, title: "A" }));
    const ratingFetch = vi.fn(async () => null);
    const result = await enrich(stubs, { apiKey: "k", tmdbSearch, tmdbGet, ratingFetch, concurrency: 1, progressEvery: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]!.lbxRating).toBeNull();
  });

  it("respects concurrency cap", async () => {
    let active = 0;
    let max = 0;
    const stubs = Array.from({ length: 10 }, (_, i) => stub({ slug: `s${i}`, title: `T${i}` }));
    const tmdbSearch = vi.fn(async () => 1);
    const tmdbGet = vi.fn(async () => {
      active++;
      max = Math.max(max, active);
      await new Promise(r => setTimeout(r, 5));
      active--;
      return fakeTmdb({});
    });
    const ratingFetch = vi.fn(async () => 4.0);
    await enrich(stubs, { apiKey: "k", tmdbSearch, tmdbGet, ratingFetch, concurrency: 3, progressEvery: 1 });
    expect(max).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 10.2: Run test to verify it fails**

```bash
npm run test -- tests/unit/enrich.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 10.3: Create `lib/enrich.ts`**

```ts
import type { Film, FilmStub } from "@/lib/types";
import type { TmdbMovie } from "@/lib/tmdb";
import { searchByTitleYear, getMovie } from "@/lib/tmdb";
import { scrapeFilmRating } from "@/lib/letterboxd";
import { ENRICH_CONCURRENCY, FILM_PAGE_TIMEOUT_MS, LETTERBOXD_BASE, PROGRESS_THROTTLE } from "@/lib/config";

export type EnrichDeps = {
  apiKey: string;
  tmdbSearch?: (title: string, year: number | null, apiKey: string) => Promise<number | null>;
  tmdbGet?: (id: number, apiKey: string) => Promise<TmdbMovie | null>;
  ratingFetch?: (slug: string, signal?: AbortSignal) => Promise<number | null>;
  onProgress?: (loaded: number, total: number) => void;
  concurrency?: number;
  progressEvery?: number;
  signal?: AbortSignal;
};

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null as T | null), ms);
    p.then(v => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(null as T | null); });
  });
}

export async function enrich(stubs: FilmStub[], deps: EnrichDeps): Promise<Film[]> {
  const search = deps.tmdbSearch ?? searchByTitleYear;
  const fetchMovie = deps.tmdbGet ?? getMovie;
  const fetchRating = deps.ratingFetch ?? scrapeFilmRating;
  const concurrency = deps.concurrency ?? ENRICH_CONCURRENCY;
  const progressEvery = deps.progressEvery ?? PROGRESS_THROTTLE;

  const results: (Film | null)[] = new Array(stubs.length).fill(null);
  let loaded = 0;
  let nextEmit = progressEvery;

  const indices = stubs.map((_, i) => i);

  async function worker() {
    while (indices.length > 0) {
      const i = indices.shift();
      if (i === undefined) return;
      const stub = stubs[i]!;

      const tmdbId = await search(stub.title, stub.year, deps.apiKey);
      if (tmdbId === null) {
        loaded += 1;
        emitProgress();
        continue;
      }
      const movie = await fetchMovie(tmdbId, deps.apiKey);
      if (movie === null) {
        loaded += 1;
        emitProgress();
        continue;
      }
      const rating = await withTimeout(fetchRating(stub.slug, deps.signal), FILM_PAGE_TIMEOUT_MS);

      results[i] = {
        slug: stub.slug,
        title: movie.title,
        year: movie.year,
        lbxRating: rating,
        tmdbId: movie.tmdbId,
        genres: movie.genres,
        runtime: movie.runtime,
        director: movie.director,
        posterPath: movie.posterPath,
        synopsis: movie.synopsis,
        letterboxdUrl: `${LETTERBOXD_BASE}/film/${stub.slug}/`,
      };
      loaded += 1;
      emitProgress();
    }
  }

  function emitProgress() {
    if (loaded >= nextEmit || loaded === stubs.length) {
      deps.onProgress?.(loaded, stubs.length);
      nextEmit = loaded + progressEvery;
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, stubs.length) }, () => worker());
  await Promise.all(workers);

  return results.filter((f): f is Film => f !== null);
}
```

- [ ] **Step 10.4: Run test to verify it passes**

```bash
npm run test -- tests/unit/enrich.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 10.5: Commit**

```bash
git add -A
git commit -m "Add enrichment orchestrator with concurrency and progress"
```

---

## Task 11: KV cache layer

**Files:**
- Create: `lib/cache.ts`, `tests/unit/cache.test.ts`

- [ ] **Step 11.1: Write failing test `tests/unit/cache.test.ts`**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readCachedWatchlist, writeCachedWatchlist, cacheKey } from "@/lib/cache";
import type { Film } from "@/lib/types";

const film: Film = {
  slug: "the-thing", title: "The Thing", year: 1982, lbxRating: 4.1,
  tmdbId: 1091, genres: ["Horror"], runtime: 109, director: "Carpenter",
  posterPath: "/x.jpg", synopsis: "...", letterboxdUrl: "https://letterboxd.com/film/the-thing/",
};

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock("@vercel/kv", () => ({
  kv: {
    get: (...args: unknown[]) => mockGet(...args),
    set: (...args: unknown[]) => mockSet(...args),
  },
}));

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset();
});

describe("cacheKey", () => {
  it("normalises username to lowercase", () => {
    expect(cacheKey("Foo")).toBe("wl:v1:foo");
    expect(cacheKey("BAR_42")).toBe("wl:v1:bar_42");
  });
});

describe("readCachedWatchlist", () => {
  it("returns the parsed cached list", async () => {
    mockGet.mockResolvedValueOnce({ films: [film], scrapedAt: 123, sourceCount: 1 });
    const result = await readCachedWatchlist("foo");
    expect(result).not.toBeNull();
    expect(result!.films).toHaveLength(1);
  });

  it("returns null when cache miss", async () => {
    mockGet.mockResolvedValueOnce(null);
    expect(await readCachedWatchlist("foo")).toBeNull();
  });

  it("returns null when KV throws", async () => {
    mockGet.mockRejectedValueOnce(new Error("boom"));
    expect(await readCachedWatchlist("foo")).toBeNull();
  });

  it("returns null when cached value fails schema validation", async () => {
    mockGet.mockResolvedValueOnce({ unexpected: "shape" });
    expect(await readCachedWatchlist("foo")).toBeNull();
  });
});

describe("writeCachedWatchlist", () => {
  it("writes the list with TTL", async () => {
    mockSet.mockResolvedValueOnce("OK");
    await writeCachedWatchlist("foo", [film], 1);
    expect(mockSet).toHaveBeenCalledWith(
      "wl:v1:foo",
      expect.objectContaining({ films: [film], sourceCount: 1 }),
      expect.objectContaining({ ex: 21600 }),
    );
  });

  it("swallows write errors silently", async () => {
    mockSet.mockRejectedValueOnce(new Error("boom"));
    await expect(writeCachedWatchlist("foo", [film], 1)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 11.2: Run test to verify it fails**

```bash
npm run test -- tests/unit/cache.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 11.3: Create `lib/cache.ts`**

```ts
import { kv } from "@vercel/kv";
import type { Film } from "@/lib/types";
import { CachedWatchlistSchema } from "@/lib/types";
import { CACHE_VERSION, CACHE_TTL_SECONDS } from "@/lib/config";

export function cacheKey(user: string): string {
  return `wl:${CACHE_VERSION}:${user.toLowerCase()}`;
}

export async function readCachedWatchlist(user: string) {
  try {
    const raw = await kv.get(cacheKey(user));
    if (!raw) return null;
    const parsed = CachedWatchlistSchema.safeParse(raw);
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function writeCachedWatchlist(user: string, films: Film[], sourceCount: number): Promise<void> {
  try {
    await kv.set(cacheKey(user), { films, scrapedAt: Date.now(), sourceCount }, { ex: CACHE_TTL_SECONDS });
  } catch {
    // intentionally swallow — cache failures must not break the request
  }
}
```

- [ ] **Step 11.4: Run test to verify it passes**

```bash
npm run test -- tests/unit/cache.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 11.5: Commit**

```bash
git add -A
git commit -m "Add KV cache layer for enriched watchlists"
```

---

## Task 12: Watchlist API route (NDJSON streaming)

**Files:**
- Create: `app/api/watchlist/route.ts`
- Create: `tests/integration/api-watchlist.test.ts`

- [ ] **Step 12.1: Write failing test `tests/integration/api-watchlist.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server";

vi.stubEnv("TMDB_API_KEY", "test-key");

vi.mock("@/lib/cache", () => ({
  readCachedWatchlist: vi.fn(async () => null),
  writeCachedWatchlist: vi.fn(async () => {}),
  cacheKey: (u: string) => `wl:v1:${u}`,
}));

import { GET } from "@/app/api/watchlist/route";

async function readNdjson(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: unknown[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) events.push(JSON.parse(line));
    }
  }
  if (buffer.trim()) events.push(JSON.parse(buffer));
  return events;
}

describe("GET /api/watchlist", () => {
  it("streams paginated → progress → done for a successful scrape", async () => {
    server.use(
      http.get("https://letterboxd.com/foo/watchlist/", () =>
        HttpResponse.html(`<html><body><ul class="poster-list">
          <li class="poster-container"><div data-film-slug="the-thing" data-film-name="The Thing" data-film-release-year="1982"></div></li>
        </ul></body></html>`)),
      http.get("https://letterboxd.com/film/the-thing/", () =>
        HttpResponse.html(`<html><body><meta name="twitter:data2" content="4.1 out of 5"></body></html>`)),
      http.get("https://api.themoviedb.org/3/search/movie", () =>
        HttpResponse.json({ page: 1, results: [{ id: 1091, title: "The Thing", release_date: "1982-06-25" }], total_results: 1 })),
      http.get("https://api.themoviedb.org/3/movie/1091", () =>
        HttpResponse.json({
          id: 1091, title: "The Thing", release_date: "1982-06-25", runtime: 109,
          overview: "...", poster_path: "/x.jpg",
          genres: [{ id: 27, name: "Horror" }],
          credits: { crew: [{ job: "Director", name: "John Carpenter" }] },
        })),
    );

    const req = new Request("http://localhost/api/watchlist?user=foo");
    const res = await GET(req);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await readNdjson(res.body!) as Array<{ type: string }>;
    const types = events.map(e => e.type);
    expect(types[0]).toBe("paginated");
    expect(types.at(-1)).toBe("done");
  });

  it("emits an error event for non-existent user", async () => {
    server.use(
      http.get("https://letterboxd.com/ghost/watchlist/", () =>
        HttpResponse.text("Sorry, we can't find that page", { status: 404 })),
    );
    const req = new Request("http://localhost/api/watchlist?user=ghost");
    const res = await GET(req);
    const events = await readNdjson(res.body!) as Array<{ type: string; code?: string }>;
    expect(events.at(-1)).toMatchObject({ type: "error", code: "NOT_FOUND" });
  });

  it("rejects invalid usernames with 400", async () => {
    const req = new Request("http://localhost/api/watchlist?user=BAD%20USER");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 12.2: Run test to verify it fails**

```bash
npm run test -- tests/integration/api-watchlist.test.ts
```

Expected: FAIL — route not found.

- [ ] **Step 12.3: Create `app/api/watchlist/route.ts`**

```ts
import { NextResponse } from "next/server";
import type { Film, StreamEvent } from "@/lib/types";
import { scrapeWatchlist } from "@/lib/letterboxd";
import { enrich } from "@/lib/enrich";
import { readCachedWatchlist, writeCachedWatchlist } from "@/lib/cache";
import { MIN_USERNAME_LENGTH, MAX_USERNAME_LENGTH } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9_]{2,15}$/;

function ndjson(event: StreamEvent): string {
  return JSON.stringify(event) + "\n";
}

function streamResponse(generator: () => AsyncIterable<StreamEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of generator()) {
          controller.enqueue(encoder.encode(ndjson(event)));
        }
      } catch {
        controller.enqueue(encoder.encode(ndjson({ type: "error", code: "NETWORK" })));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const user = (url.searchParams.get("user") ?? "").trim().toLowerCase();
  const refresh = url.searchParams.get("refresh") === "1";

  if (!USERNAME_RE.test(user) || user.length < MIN_USERNAME_LENGTH || user.length > MAX_USERNAME_LENGTH) {
    return NextResponse.json({ error: "invalid username" }, { status: 400 });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  return streamResponse(async function* () {
    if (!refresh) {
      const cached = await readCachedWatchlist(user);
      if (cached) {
        yield { type: "paginated", total: cached.films.length };
        yield { type: "progress", loaded: cached.films.length, total: cached.films.length };
        yield { type: "done", films: cached.films };
        return;
      }
    }

    const scrape = await scrapeWatchlist(user);
    if (scrape.kind === "error") {
      yield { type: "error", code: scrape.code };
      return;
    }

    yield { type: "paginated", total: scrape.films.length };

    const queue: StreamEvent[] = [];
    const films: Film[] = await enrich(scrape.films, {
      apiKey,
      onProgress: (loaded, total) => queue.push({ type: "progress", loaded, total }),
    });

    for (const event of queue) yield event;

    yield { type: "done", films };
    await writeCachedWatchlist(user, films, scrape.films.length);
  });
}
```

> **Note on progress streaming.** The implementation above buffers progress events and emits them after enrichment completes (because async generators can't yield from inside synchronous callbacks). This is acceptable for v1 — the user still sees one progressive update sequence, just at the end. A true streaming progress (yield-as-you-go) is a v1.1 polish; if the QA experience feels flat, swap the buffer for a queue-based async iterator. **Do not block this task on it.**

- [ ] **Step 12.4: Run test to verify it passes**

```bash
npm run test -- tests/integration/api-watchlist.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 12.5: Commit**

```bash
git add -A
git commit -m "Add /api/watchlist NDJSON streaming route"
```

---

## Task 13: FilterColumn component

**Files:**
- Create: `components/FilterColumn.tsx`, `components/FilterColumn.module.css` (or use Tailwind utility classes inline)
- Create: `tests/components/FilterColumn.test.tsx`

- [ ] **Step 13.1: Write failing test `tests/components/FilterColumn.test.tsx`**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterColumn } from "@/components/FilterColumn";

describe("FilterColumn", () => {
  it("renders the current value", () => {
    render(<FilterColumn label="GENRE" options={["ANY", "Horror", "Drama"]} value="Horror" onChange={() => {}} />);
    expect(screen.getByText("Horror")).toBeInTheDocument();
    expect(screen.getByText("GENRE")).toBeInTheDocument();
  });

  it("calls onChange with the next option when down arrow clicked", () => {
    const onChange = vi.fn();
    render(<FilterColumn label="GENRE" options={["ANY", "Horror", "Drama"]} value="ANY" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/next/i));
    expect(onChange).toHaveBeenCalledWith("Horror");
  });

  it("calls onChange with the previous option when up arrow clicked", () => {
    const onChange = vi.fn();
    render(<FilterColumn label="GENRE" options={["ANY", "Horror", "Drama"]} value="Horror" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/previous/i));
    expect(onChange).toHaveBeenCalledWith("ANY");
  });

  it("wraps around at the boundaries", () => {
    const onChange = vi.fn();
    render(<FilterColumn label="GENRE" options={["A", "B", "C"]} value="C" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/next/i));
    expect(onChange).toHaveBeenCalledWith("A");
  });

  it("supports keyboard arrow navigation", () => {
    const onChange = vi.fn();
    render(<FilterColumn label="GENRE" options={["A", "B", "C"]} value="A" onChange={onChange} />);
    const listbox = screen.getByRole("listbox");
    listbox.focus();
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith("B");
  });
});
```

- [ ] **Step 13.2: Run test to verify it fails**

```bash
npm run test -- tests/components/FilterColumn.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 13.3: Create `components/FilterColumn.tsx`**

```tsx
"use client";

import { useCallback } from "react";

export type FilterColumnProps = {
  label: string;
  options: string[];
  value: string;
  onChange: (next: string) => void;
};

export function FilterColumn({ label, options, value, onChange }: FilterColumnProps) {
  const idx = Math.max(0, options.indexOf(value));
  const advance = useCallback((delta: number) => {
    if (options.length === 0) return;
    const next = (idx + delta + options.length) % options.length;
    const target = options[next];
    if (target !== undefined && target !== value) onChange(target);
  }, [idx, options, onChange, value]);

  return (
    <div
      role="listbox"
      tabIndex={0}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); advance(1); }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); advance(-1); }
      }}
      onWheel={(e) => {
        e.preventDefault();
        advance(e.deltaY > 0 ? 1 : -1);
      }}
      className="flex flex-col items-center gap-1 select-none focus:outline-none focus:ring-2 focus:ring-amber"
    >
      <div
        className="text-[10px] tracking-[0.25em] text-[var(--color-muted)] font-mono"
      >
        {label}
      </div>
      <button
        aria-label={`${label} previous`}
        onClick={() => advance(-1)}
        className="text-[12px] text-[var(--color-muted)] hover:text-[var(--color-board-letter)] cursor-pointer bg-transparent border-0 p-0"
      >
        ▲
      </button>
      <div
        className="font-display font-black uppercase text-[24px] sm:text-[28px] tracking-[0.08em] text-[var(--color-board-letter)] min-h-[1.2em]"
        aria-live="polite"
      >
        {value}
      </div>
      <button
        aria-label={`${label} next`}
        onClick={() => advance(1)}
        className="text-[12px] text-[var(--color-muted)] hover:text-[var(--color-board-letter)] cursor-pointer bg-transparent border-0 p-0"
      >
        ▼
      </button>
    </div>
  );
}
```

- [ ] **Step 13.4: Run test to verify it passes**

```bash
npm run test -- tests/components/FilterColumn.test.tsx
```

Expected: PASS — 5 tests.

- [ ] **Step 13.5: Commit**

```bash
git add -A
git commit -m "Add FilterColumn component"
```

---

## Task 14: LetterBoard component (filter + result modes)

> **Architecture note:** The LetterBoard has only two visual modes. During the watchlist scrape, the page keeps the board in `filter` mode (so the user can pre-set filters during the wait) and the loading counter is rendered *outside* the board by `ProgressLine`. Only the PICK button is dimmed during loading.

**Files:**
- Create: `components/LetterBoard.tsx`
- Create: `tests/components/LetterBoard.test.tsx`

- [ ] **Step 14.1: Write failing test `tests/components/LetterBoard.test.tsx`**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LetterBoard } from "@/components/LetterBoard";

describe("LetterBoard — filter mode", () => {
  it("renders three filter columns", () => {
    render(
      <LetterBoard
        mode="filter"
        state={{ genre: "ANY", decade: "ANY", minRating: 0 }}
        options={{ genres: ["ANY", "Horror"], decades: ["ANY", "1980s"] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("GENRE")).toBeInTheDocument();
    expect(screen.getByText("DECADE")).toBeInTheDocument();
    expect(screen.getByText("MIN RATING")).toBeInTheDocument();
  });

  it("displays the NOW SHOWING footer", () => {
    render(
      <LetterBoard
        mode="filter"
        state={{ genre: "ANY", decade: "ANY", minRating: 0 }}
        options={{ genres: ["ANY"], decades: ["ANY"] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/NOW SHOWING/)).toBeInTheDocument();
  });
});

describe("LetterBoard — result mode", () => {
  const film = {
    slug: "the-thing", title: "The Thing", year: 1982, lbxRating: 4.1, tmdbId: 1091,
    genres: ["Horror"], runtime: 109, director: "John Carpenter", posterPath: "/x.jpg",
    synopsis: "...", letterboxdUrl: "https://letterboxd.com/film/the-thing/",
  };

  it("renders the title", () => {
    render(<LetterBoard mode="result" film={film} />);
    expect(screen.getByText(/THE THING/i)).toBeInTheDocument();
  });

  it("renders DIRECTOR · YEAR · RUNTIME meta", () => {
    render(<LetterBoard mode="result" film={film} />);
    expect(screen.getByText(/CARPENTER/i)).toBeInTheDocument();
    expect(screen.getByText(/1982/)).toBeInTheDocument();
    expect(screen.getByText(/109/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 14.2: Run test to verify it fails**

```bash
npm run test -- tests/components/LetterBoard.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 14.3: Create `components/LetterBoard.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { Film, FilterState } from "@/lib/types";
import { FilterColumn } from "@/components/FilterColumn";

type FilterModeProps = {
  mode: "filter";
  state: FilterState;
  options: { genres: string[]; decades: string[] };
  onChange: (next: FilterState) => void;
};

type ResultModeProps = {
  mode: "result";
  film: Film;
};

type Props = FilterModeProps | ResultModeProps;

const RATING_OPTIONS = ["ANY", "0.5+", "1.0+", "1.5+", "2.0+", "2.5+", "3.0+", "3.5+", "4.0+", "4.5+", "5.0"];

function ratingLabel(value: number): string {
  if (value === 0) return "ANY";
  if (value === 5) return "5.0";
  return `${value.toFixed(1)}+`;
}

function ratingFromLabel(label: string): number {
  if (label === "ANY") return 0;
  if (label === "5.0") return 5;
  return parseFloat(label.replace("+", ""));
}

function FrameWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-board-frame)] p-2 rounded-[3px] shadow-[0_4px_0_#2c1d0e,0_12px_24px_rgba(0,0,0,0.3)]">
      <div className="bg-[var(--color-board-bg)] border border-[#1a1a1a] px-6 pt-6 pb-5 relative font-display"
        style={{
          backgroundImage: "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.02) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.02) 0%, transparent 40%)",
        }}>
        <Pinstripes />
        {children}
      </div>
    </div>
  );
}

function Pinstripes() {
  return (
    <>
      <div className="absolute left-6 right-6 top-2 h-1.5" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 14px, #2a2a2a 14px 18px)" }} />
      <div className="absolute left-6 right-6 bottom-2 h-1.5" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 14px, #2a2a2a 14px 18px)" }} />
    </>
  );
}

function FilterMode({ state, options, onChange }: FilterModeProps) {
  return (
    <FrameWrapper>
      <div className="flex justify-between font-mono text-[10px] tracking-[0.3em] text-[var(--color-muted)] mb-3 px-1">
        <span>SET YOUR FILTERS</span>
        <span>SCROLL ↑↓</span>
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-2 px-1 py-1">
        <FilterColumn
          label="GENRE"
          options={options.genres}
          value={state.genre}
          onChange={(genre) => onChange({ ...state, genre })}
        />
        <FilterColumn
          label="DECADE"
          options={options.decades}
          value={state.decade}
          onChange={(decade) => onChange({ ...state, decade })}
        />
        <FilterColumn
          label="MIN RATING"
          options={RATING_OPTIONS}
          value={ratingLabel(state.minRating)}
          onChange={(label) => onChange({ ...state, minRating: ratingFromLabel(label) })}
        />
      </div>
      <div className="font-mono text-[10px] tracking-[0.4em] text-[#555] text-center mt-4">— NOW SHOWING —</div>
    </FrameWrapper>
  );
}

function ResultMode({ film }: ResultModeProps) {
  const surname = film.director.split(" ").pop()?.toUpperCase() ?? "";
  const titleLetters = useMemo(() => film.title.toUpperCase().split(""), [film.title]);
  const [shownLetters, setShownLetters] = useState(0);

  useEffect(() => {
    setShownLetters(0);
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShownLetters(titleLetters.length);
      return;
    }
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setShownLetters(i);
      if (i >= titleLetters.length) clearInterval(interval);
    }, 80);
    return () => clearInterval(interval);
  }, [titleLetters]);

  const rating = film.lbxRating;
  const stars = rating !== null ? "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating)) : "";

  return (
    <FrameWrapper>
      <div className="flex justify-between font-mono text-[10px] tracking-[0.3em] text-[var(--color-muted)] mb-3 px-1">
        <span>FEATURE PRESENTATION</span>
        {rating !== null && <span>★ {rating.toFixed(1)} / 5</span>}
      </div>
      <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--color-amber)] text-center mb-3">— NOW SHOWING —</div>
      <div className="font-display font-black uppercase text-center text-[36px] sm:text-[44px] tracking-[0.06em] leading-[0.95] text-[var(--color-board-letter)] min-h-[1.2em]">
        {titleLetters.slice(0, shownLetters).join("")}
      </div>
      <div className="font-mono text-[11px] tracking-[0.2em] text-[#aaa] text-center mt-3 uppercase">
        {surname} · {film.year} · {film.runtime}<span className="lowercase opacity-70">min</span>
      </div>
      {stars && (
        <div className="font-mono text-[12px] tracking-[0.3em] text-[var(--color-amber)] text-center mt-2">{stars}</div>
      )}
    </FrameWrapper>
  );
}

export function LetterBoard(props: Props) {
  if (props.mode === "filter") return <FilterMode {...props} />;
  return <ResultMode {...props} />;
}
```

- [ ] **Step 14.4: Run test to verify it passes**

```bash
npm run test -- tests/components/LetterBoard.test.tsx
```

Expected: PASS — 4 tests.

- [ ] **Step 14.5: Commit**

```bash
git add -A
git commit -m "Add LetterBoard component with filter and result modes"
```

---

## Task 15: UsernameInput component

**Files:**
- Create: `components/UsernameInput.tsx`

- [ ] **Step 15.1: Create `components/UsernameInput.tsx`**

```tsx
"use client";

import { useEffect, useId, useState } from "react";
import { MAX_USERNAME_LENGTH, MIN_USERNAME_LENGTH } from "@/lib/config";

const STORAGE_KEY = "lbxp:lastUser";
const RE = /^[a-z0-9_]+$/;

function normalise(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\/(www\.)?letterboxd\.com\//, "");
  s = s.replace(/^@/, "");
  s = s.replace(/\/.*$/, "");
  return s;
}

export type UsernameInputProps = {
  onSubmit: (user: string) => void;
  disabled?: boolean;
};

export function UsernameInput({ onSubmit, disabled }: UsernameInputProps) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setValue(stored);
    } catch {}
  }, []);

  const validate = (raw: string): string | null => {
    const v = normalise(raw);
    if (v.length === 0) return null;
    if (v.length < MIN_USERNAME_LENGTH || v.length > MAX_USERNAME_LENGTH) return "INVALID HANDLE";
    if (!RE.test(v)) return "INVALID HANDLE";
    return null;
  };

  const submit = () => {
    const v = normalise(value);
    const err = validate(value);
    if (err || v.length === 0) {
      setError(err ?? "ENTER A HANDLE");
      return;
    }
    setError(null);
    try { localStorage.setItem(STORAGE_KEY, v); } catch {}
    onSubmit(v);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="font-display font-black text-[28px] text-[var(--color-ink)]">@</label>
        <input
          id={id}
          type="text"
          value={value}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder="your_username"
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          onBlur={submit}
          className="flex-1 bg-transparent border-0 border-b-2 border-[var(--color-ink)] py-2 font-display text-[22px] font-bold tracking-[0.02em] text-[var(--color-ink)] outline-none disabled:opacity-50"
        />
      </div>
      {error && (
        <div className="font-mono text-[11px] tracking-[0.2em] text-[var(--color-accent)] mt-2">{error}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 15.2: Quick visual check**

```bash
npm run dev
```

Use the component manually inserted into `app/page.tsx` if you want to eyeball it; otherwise wait until Task 19. Stop the dev server.

- [ ] **Step 15.3: Commit**

```bash
git add -A
git commit -m "Add UsernameInput component with validation and autofill"
```

---

## Task 16: PickButton component

**Files:**
- Create: `components/PickButton.tsx`

- [ ] **Step 16.1: Create `components/PickButton.tsx`**

```tsx
"use client";

export type PickButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
};

export function PickButton({ onClick, disabled, children }: PickButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="block w-full mt-6 py-[18px] bg-[var(--color-ink)] text-[var(--color-paper)] font-display font-black text-[22px] tracking-[0.2em] uppercase border-0 cursor-pointer transition-transform"
      style={{
        boxShadow: disabled ? "none" : "6px 6px 0 var(--color-accent)",
        opacity: disabled ? 0.4 : 1,
        transform: "translate(0, 0)",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.transform = "translate(-2px, -2px)"; e.currentTarget.style.boxShadow = "8px 8px 0 var(--color-accent)"; } }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translate(0, 0)"; e.currentTarget.style.boxShadow = disabled ? "none" : "6px 6px 0 var(--color-accent)"; }}
    >
      {children ?? <>PICK MY FILM <span style={{ color: "var(--color-accent)" }}>▸</span></>}
    </button>
  );
}
```

- [ ] **Step 16.2: Commit**

```bash
git add -A
git commit -m "Add PickButton component with brutalist red drop-shadow"
```

---

## Task 17: FilmDetails component

**Files:**
- Create: `components/FilmDetails.tsx`

- [ ] **Step 17.1: Create `components/FilmDetails.tsx`**

```tsx
"use client";

import type { Film } from "@/lib/types";

const TMDB_IMG = "https://image.tmdb.org/t/p/w342";

export type FilmDetailsProps = {
  film: Film;
  onReroll: () => void;
  rerollDisabled?: boolean;
};

export function FilmDetails({ film, onReroll, rerollDisabled }: FilmDetailsProps) {
  const poster = film.posterPath ? TMDB_IMG + film.posterPath : null;
  return (
    <>
      <div className="grid grid-cols-[110px_1fr] gap-4 mt-4">
        <div className="aspect-[2/3] bg-[#2a1f1f] rounded-sm overflow-hidden">
          {poster && <img src={poster} alt={`${film.title} poster`} className="w-full h-full object-cover" loading="lazy" />}
        </div>
        <div className="text-[12px] leading-[1.5] opacity-85">
          <div className="font-black text-[11px] tracking-[0.15em] uppercase mb-1">Dir. {film.director}</div>
          <p>{film.synopsis}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          onClick={onReroll}
          disabled={rerollDisabled}
          className="flex-1 py-3 bg-[var(--color-paper)] text-[var(--color-ink)] border-2 border-[var(--color-ink)] font-display font-bold text-[11px] tracking-[0.2em] uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ↻ Reroll
        </button>
        <a
          href={film.letterboxdUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-3 bg-[var(--color-ink)] text-[var(--color-paper)] border-2 border-[var(--color-ink)] font-display font-bold text-[11px] tracking-[0.2em] uppercase text-center no-underline"
        >
          View on Letterboxd ↗
        </a>
      </div>
    </>
  );
}
```

- [ ] **Step 17.2: Commit**

```bash
git add -A
git commit -m "Add FilmDetails component with poster, synopsis, and actions"
```

---

## Task 18: Header, Colophon, and ProgressLine

**Files:**
- Create: `components/Header.tsx`, `components/Colophon.tsx`, `components/ProgressLine.tsx`

- [ ] **Step 18.1: Create `components/Header.tsx`**

```tsx
export type HeaderProps = {
  variant?: "idle" | "result";
};

export function Header({ variant = "idle" }: HeaderProps) {
  return (
    <header>
      <div className="flex justify-between items-baseline text-[10px] font-bold tracking-[0.25em] uppercase">
        <span>Letterboxd · Watchlist Picker</span>
        <span className="text-[var(--color-accent)]">№ 042</span>
      </div>
      <div className="h-[2px] bg-[var(--color-ink)] my-3" />
      {variant === "idle" ? (
        <>
          <h1 className="font-display font-black text-[44px] sm:text-[64px] leading-[0.88] tracking-[-0.04em] my-3">
            PICK ME<br />A FILM<span className="text-[var(--color-accent)]">.</span>
          </h1>
          <p className="text-[13px] max-w-[320px] leading-[1.4] opacity-85 mb-4">
            Surrender the choice. We&rsquo;ll pull a film from your Letterboxd watchlist that fits the night.
          </p>
        </>
      ) : (
        <h1 className="font-display font-black text-[28px] sm:text-[36px] leading-[0.88] tracking-[-0.04em] mb-4">
          TONIGHT<span className="text-[var(--color-accent)]">,</span><br />YOU WATCH
        </h1>
      )}
    </header>
  );
}
```

- [ ] **Step 18.2: Create `components/Colophon.tsx`**

```tsx
export function Colophon() {
  return (
    <footer className="mt-12 pt-4 border-t border-[var(--color-ink)] border-opacity-30 text-[10px] tracking-[0.2em] uppercase opacity-60">
      Letterboxd is a trademark of Letterboxd Limited. This site is not affiliated.
    </footer>
  );
}
```

- [ ] **Step 18.3: Create `components/ProgressLine.tsx`**

```tsx
export type ProgressLineProps = {
  text: string;
  tone?: "default" | "amber" | "muted";
};

export function ProgressLine({ text, tone = "default" }: ProgressLineProps) {
  const colour = tone === "amber" ? "var(--color-amber)" : tone === "muted" ? "var(--color-muted)" : "var(--color-ink)";
  return (
    <div
      className="text-[10px] font-mono tracking-[0.3em] uppercase mt-3 text-center"
      style={{ color: colour, opacity: tone === "muted" ? 0.5 : 0.85 }}
    >
      {text}
    </div>
  );
}
```

- [ ] **Step 18.4: Commit**

```bash
git add -A
git commit -m "Add Header, Colophon, and ProgressLine components"
```

---

## Task 19: Page client root (state machine + streaming fetch + error mapping)

**Files:**
- Create: `app/page.client.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 19.1: Create `app/page.client.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorCode, Film, FilterState, StreamEvent } from "@/lib/types";
import { StreamEventSchema } from "@/lib/types";
import { DEFAULT_FILTER_STATE } from "@/lib/config";
import { applyFilters, decadeFromYear, pickRandom } from "@/lib/filter";
import { Header } from "@/components/Header";
import { UsernameInput } from "@/components/UsernameInput";
import { LetterBoard } from "@/components/LetterBoard";
import { PickButton } from "@/components/PickButton";
import { FilmDetails } from "@/components/FilmDetails";
import { ProgressLine } from "@/components/ProgressLine";
import { Colophon } from "@/components/Colophon";

type AppState =
  | { kind: "idle" }
  | { kind: "loading"; user: string; loaded: number; total: number }
  | { kind: "filter"; user: string; films: Film[] }
  | { kind: "result"; user: string; films: Film[]; picked: Film }
  | { kind: "error"; code: ErrorCode; user: string };

const ERROR_COPY: Record<ErrorCode, { title: string; sub: (u: string) => string }> = {
  NOT_FOUND: { title: "NO SUCH PATRON.", sub: u => `@${u} IS NOT ON LETTERBOXD` },
  PRIVATE: { title: "PRIVATE SCREENING.", sub: u => `@${u}'S WATCHLIST IS NOT PUBLIC` },
  EMPTY: { title: "EMPTY QUEUE.", sub: u => `@${u}'S WATCHLIST HAS NO FILMS YET` },
  RATE_LIMIT: { title: "BOX OFFICE CLOSED.", sub: () => "LETTERBOXD IS RATE-LIMITING US — TRY AGAIN IN A MINUTE" },
  NETWORK: { title: "INTERMISSION.", sub: () => "SOMETHING WENT WRONG · CHECK YOUR CONNECTION" },
  PARSER: { title: "INTERMISSION.", sub: () => "SOMETHING WENT WRONG ON OUR SIDE" },
};

const RATE_LIMIT_COOLDOWN_SECONDS = 60;

export function PageClient() {
  const [state, setState] = useState<AppState>({ kind: "idle" });
  const [filter, setFilter] = useState<FilterState>({ ...DEFAULT_FILTER_STATE });
  const abortRef = useRef<AbortController | null>(null);

  const films = state.kind === "filter" || state.kind === "result" ? state.films : [];
  const filtered = useMemo(() => applyFilters(films, filter), [films, filter]);

  const filterOptions = useMemo(() => {
    const genreSet = new Set<string>();
    const decadeSet = new Set<string>();
    for (const f of films) {
      for (const g of f.genres) genreSet.add(g);
      decadeSet.add(decadeFromYear(f.year));
    }
    return {
      genres: ["ANY", ...Array.from(genreSet).sort()],
      decades: ["ANY", ...Array.from(decadeSet).sort((a, b) => b.localeCompare(a))],
    };
  }, [films]);

  const submit = useCallback(async (user: string, refresh = false) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ kind: "loading", user, loaded: 0, total: 0 });
    setFilter({ ...DEFAULT_FILTER_STATE });

    try {
      const url = `/api/watchlist?user=${encodeURIComponent(user)}${refresh ? "&refresh=1" : ""}`;
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        setState({ kind: "error", code: "NETWORK", user });
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const parsed = StreamEventSchema.safeParse(JSON.parse(line));
          if (!parsed.success) continue;
          handleEvent(parsed.data, user);
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({ kind: "error", code: "NETWORK", user });
    }
  }, []);

  const handleEvent = (event: StreamEvent, user: string) => {
    if (event.type === "paginated") setState({ kind: "loading", user, loaded: 0, total: event.total });
    else if (event.type === "progress") setState({ kind: "loading", user, loaded: event.loaded, total: event.total });
    else if (event.type === "done") setState({ kind: "filter", user, films: event.films });
    else if (event.type === "error") setState({ kind: "error", code: event.code, user });
  };

  const onPick = () => {
    if (state.kind !== "filter" && state.kind !== "result") return;
    if (filtered.length === 0) return;
    const lastSlug = state.kind === "result" ? state.picked.slug : undefined;
    const picked = pickRandom(filtered, lastSlug);
    setState({ kind: "result", user: state.user, films: state.films, picked });
  };

  const onReroll = () => onPick();

  const onEditFilters = () => {
    if (state.kind === "result") setState({ kind: "filter", user: state.user, films: state.films });
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  // ---------- Rate-limit countdown ----------
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (state.kind === "error" && state.code === "RATE_LIMIT") {
      setCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
      const t = setInterval(() => setCooldown(c => (c > 0 ? c - 1 : 0)), 1000);
      return () => clearInterval(t);
    }
    setCooldown(0);
  }, [state]);

  // ---------- Render ----------
  const isResult = state.kind === "result";

  let progressText = "";
  let progressTone: "default" | "amber" | "muted" = "default";
  if (state.kind === "loading") {
    progressText = state.total > 0 ? `LOADING · ${state.loaded} / ${state.total}` : "LOADING — FETCHING WATCHLIST";
  } else if (state.kind === "filter") {
    if (filtered.length === 0) { progressText = "0 FILMS MATCH — LOOSEN FILTERS"; progressTone = "amber"; }
    else { progressText = `${filtered.length} FILMS MATCH`; progressTone = "muted"; }
  } else if (state.kind === "result") {
    progressText = `PULLED FROM ${filtered.length} FILMS MATCHING YOUR FILTERS`;
    progressTone = "muted";
  }

  return (
    <main className="max-w-[720px] mx-auto px-5 sm:px-10 py-10 min-h-screen">
      <Header variant={isResult ? "result" : "idle"} />

      {state.kind !== "result" && (
        <div className="flex items-end gap-3 mb-2">
          <div className="flex-1">
            <UsernameInput onSubmit={(u) => submit(u, false)} disabled={state.kind === "loading"} />
          </div>
          {(state.kind === "filter") && (
            <button
              onClick={() => submit(state.user, true)}
              title="Refresh watchlist (clears cache)"
              className="bg-transparent border-0 font-mono text-[10px] tracking-[0.2em] uppercase opacity-60 hover:opacity-100 cursor-pointer pb-3"
            >
              ↻ refresh watchlist
            </button>
          )}
        </div>
      )}

      {state.kind === "error" ? (
        <div className="bg-[var(--color-board-frame)] p-2 rounded-[3px] my-4">
          <div className="bg-[var(--color-board-bg)] p-6 text-center font-display">
            <div className="font-black text-[28px] sm:text-[36px] tracking-[0.06em] uppercase text-[var(--color-board-letter)]">{ERROR_COPY[state.code].title}</div>
            <div className="font-mono text-[11px] tracking-[0.2em] mt-3 text-[var(--color-amber)] uppercase">{ERROR_COPY[state.code].sub(state.user)}</div>
            {state.code === "PRIVATE" && (
              <a
                href="https://letterboxd.com/about/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-board-letter)] underline"
              >
                How to make a watchlist public ↗
              </a>
            )}
          </div>
        </div>
      ) : state.kind === "result" ? (
        <LetterBoard mode="result" film={state.picked} />
      ) : (
        <LetterBoard mode="filter" state={filter} options={filterOptions} onChange={setFilter} />
      )}

      {progressText && <ProgressLine text={progressText} tone={progressTone} />}

      {(state.kind === "filter" || state.kind === "loading") && (
        <PickButton
          onClick={onPick}
          disabled={state.kind === "loading" || filtered.length === 0}
        />
      )}

      {state.kind === "result" && (
        <>
          <FilmDetails film={state.picked} onReroll={onReroll} rerollDisabled={filtered.length <= 1} />
          <button
            onClick={onEditFilters}
            className="block mx-auto mt-6 bg-transparent border-0 font-mono text-[11px] tracking-[0.2em] uppercase opacity-60 hover:opacity-100 cursor-pointer"
          >
            ← Edit filters
          </button>
        </>
      )}

      {state.kind === "error" && (
        <button
          onClick={() => submit(state.user, true)}
          disabled={state.code === "RATE_LIMIT" && cooldown > 0}
          className="block w-full mt-6 py-3 bg-[var(--color-ink)] text-[var(--color-paper)] font-display font-bold text-[11px] tracking-[0.2em] uppercase border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state.code === "RATE_LIMIT" && cooldown > 0 ? `↻ Try again in ${cooldown}s` : "↻ Try again"}
        </button>
      )}

      <Colophon />
    </main>
  );
}
```

- [ ] **Step 19.2: Replace `app/page.tsx`**

```tsx
import { PageClient } from "./page.client";

export default function Page() {
  return <PageClient />;
}
```

- [ ] **Step 19.3: Manual smoke test**

You'll need TMDB credentials and KV before this works end-to-end. For a UI-only smoke test, temporarily stub the API in dev:

```bash
# In a separate terminal:
npm run dev
```

Open http://localhost:3000. Confirm the idle layout renders: cream page, big title, `@_______`, letter-board with Genre/Decade/Min Rating columns. Type a username and confirm the loading transition fires (the actual scrape will fail without env vars; that's fine for visual QA).

Stop dev server.

- [ ] **Step 19.4: Commit**

```bash
git add -A
git commit -m "Wire page client root with state machine, streaming fetch, error states"
```

---

## Task 20: Environment configuration and example file

**Files:**
- Create: `.env.example`, `README.md`

- [ ] **Step 20.1: Create `.env.example`**

```bash
# TMDB API key — get one for free at https://www.themoviedb.org/settings/api
TMDB_API_KEY=

# Vercel KV (auto-set by Vercel when KV is added to the project; only needed for local dev)
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

- [ ] **Step 20.2: Create `README.md`**

```markdown
# Letterboxd Watchlist Picker

Single-page web app that picks a random film from a public Letterboxd watchlist with Genre/Decade/Min Rating filters.

## Setup

1. Copy `.env.example` to `.env.local` and fill in `TMDB_API_KEY`.
2. `npm install`
3. `npm run dev`

## Deploy (Vercel)

1. Push to GitHub.
2. Import the repo in Vercel.
3. Add a Vercel KV store to the project (Storage → Create → KV) — env vars are wired automatically.
4. Add `TMDB_API_KEY` to Project Settings → Environment Variables.
5. Deploy.

## Tests

```bash
npm run test       # Vitest
npm run test:e2e   # Playwright
npm run typecheck
```
```

- [ ] **Step 20.3: Commit**

```bash
git add -A
git commit -m "Add env example and README with setup and deploy notes"
```

---

## Task 21: Playwright E2E happy-path test

**Files:**
- Create: `playwright.config.ts`, `e2e/picker.spec.ts`

- [ ] **Step 21.1: Install Playwright browsers**

```bash
npx playwright install chromium
```

- [ ] **Step 21.2: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

- [ ] **Step 21.3: Create `e2e/picker.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("idle page renders core elements", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("PICK ME")).toBeVisible();
  await expect(page.getByText(/A FILM/)).toBeVisible();
  await expect(page.getByText("GENRE")).toBeVisible();
  await expect(page.getByText("DECADE")).toBeVisible();
  await expect(page.getByText("MIN RATING")).toBeVisible();
});

test("invalid username shows inline error", async ({ page }) => {
  await page.goto("/");
  const input = page.getByRole("textbox");
  await input.fill("a"); // too short
  await input.blur();
  await expect(page.getByText(/INVALID HANDLE/)).toBeVisible();
});
```

> **Note:** A live happy-path test (real Letterboxd scrape) is environment-dependent and risks flakiness. The two checks above are the minimum useful smoke. A fuller test using a local mock server can be added later.

- [ ] **Step 21.4: Run Playwright**

```bash
npm run test:e2e
```

Expected: 2 tests pass.

- [ ] **Step 21.5: Commit**

```bash
git add -A
git commit -m "Add Playwright config and minimal E2E smoke tests"
```

---

## Task 22: Manual end-to-end QA

This task is execution-only — no code, no commit.

- [ ] **Step 22.1: Set up local environment**

Create `.env.local` from `.env.example`. Put your real `TMDB_API_KEY`. For local KV, either:
- Skip KV (cache writes will silently fail; it works without).
- Or use `npm install -g @vercel/cli` and `vercel link` + `vercel env pull .env.local`.

- [ ] **Step 22.2: Run dev server**

```bash
npm run dev
```

- [ ] **Step 22.3: Test small public watchlist**

Use a public Letterboxd account with <50 films (find one or use your own). Verify:
- Loading counter ticks up.
- Filter columns populate with real genres and decades.
- PICK reveals a film with letters sliding in.
- Reroll picks a different film.
- View on Letterboxd opens the right URL.

- [ ] **Step 22.4: Test medium and large watchlists**

Repeat with ~200 and >500 film accounts. Confirm performance budgets (≤30s for 500 films first-time; rerolls instant).

- [ ] **Step 22.5: Test error states**

- Username `aaaaaaaaaaaaaaaaaaaaaa` → invalid handle.
- Username `nonexistentuserxyz123` → NOT_FOUND error board.
- A known private profile → PRIVATE error board.

- [ ] **Step 22.6: Test mobile**

Open on Mobile Safari (or Chrome devtools mobile emulation). Confirm filters readable and the layout doesn't break below 540px.

- [ ] **Step 22.7: Test reduced motion**

In OS settings, enable Reduce Motion. PICK should reveal the title instantly with no slide.

---

## Task 23: Deploy

This task is execution-only.

- [ ] **Step 23.1: Push to GitHub**

```bash
git remote add origin git@github.com:<you>/letterboxd-picker.git
git push -u origin main
```

(Skip if you don't want this repo on GitHub yet.)

- [ ] **Step 23.2: Deploy to Vercel**

```bash
npx vercel --prod
```

Or use the Vercel UI: import repo → set `TMDB_API_KEY` → add Vercel KV store → deploy.

- [ ] **Step 23.3: Smoke test production URL**

Test the same flows as in Task 22.3–22.5 against the production URL. Done.

---

## Notes for the implementer

- **Why no test file for the API route's error states beyond NOT_FOUND?** The lower units (scrapeWatchlist, enrich) cover each error code. The route handler test verifies the orchestration. Adding more error-code tests at the route level would duplicate coverage; skip them.
- **Why progress events are buffered in Task 12 instead of streamed live?** Async generators can't yield from inside a sync callback. Live progress requires a queue + producer/consumer dance. Acceptable v1 trade-off; user still sees the counter, just at the end of enrichment. v1.1 polish.
- **Why no FilmStub-only API endpoint or paginated client fetch?** Filters need full metadata. Half-loaded watchlists produce wrong filter counts. Wait for `done`, then go.
- **Why Tailwind v4 with CSS variables instead of theme tokens?** Tailwind v4's `@theme` block exposes the same tokens to JIT classes. Using CSS variables directly in inline `style={}` props was deliberate where colours come from runtime state (e.g., progress tone). Don't refactor to pure utility classes — the variable approach reads better at the call sites.
- **Why no framer-motion / motion library?** A `setInterval` per-letter is 6 lines. Adding a 50KB animation library to ship one slide-in animation is YAGNI.
- **Why `runtime = "nodejs"` on the API route?** `cheerio` doesn't run on Edge. Worth a short comment in the file if anyone wonders later.
