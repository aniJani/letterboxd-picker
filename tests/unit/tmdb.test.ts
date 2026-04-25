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
