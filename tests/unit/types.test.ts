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
