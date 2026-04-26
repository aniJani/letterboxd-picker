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
  backdropPath: "/b.jpg",
  synopsis: "Plot.",
  rating: 4.0,
  ...overrides,
});

describe("enrich", () => {
  it("enriches all stubs in input order", async () => {
    const stubs = [stub({ slug: "a", title: "A" }), stub({ slug: "b", title: "B" }), stub({ slug: "c", title: "C" })];
    const tmdbSearch = vi.fn(async (title: string) => ({ a: 10, b: 20, c: 30 } as Record<string, number>)[title.toLowerCase()] ?? null);
    const tmdbGet = vi.fn(async (id: number) => fakeTmdb({ tmdbId: id, title: id === 10 ? "A" : id === 20 ? "B" : "C", rating: 4.0 }));

    const progress: Array<{ loaded: number; total: number }> = [];
    const result = await enrich(stubs, {
      apiKey: "k",
      tmdbSearch,
      tmdbGet,
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
    const result = await enrich(stubs, { apiKey: "k", tmdbSearch, tmdbGet, concurrency: 2, progressEvery: 1 });
    expect(result.map(f => f.slug)).toEqual(["a"]);
  });

  it("propagates null rating from TMDB (no votes)", async () => {
    const stubs = [stub({ slug: "a", title: "A" })];
    const tmdbSearch = vi.fn(async () => 10);
    const tmdbGet = vi.fn(async (id: number) => fakeTmdb({ tmdbId: id, title: "A", rating: null }));
    const result = await enrich(stubs, { apiKey: "k", tmdbSearch, tmdbGet, concurrency: 1, progressEvery: 1 });
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
    await enrich(stubs, { apiKey: "k", tmdbSearch, tmdbGet, concurrency: 3, progressEvery: 1 });
    expect(max).toBeLessThanOrEqual(3);
  });
});
