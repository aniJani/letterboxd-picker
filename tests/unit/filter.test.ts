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
