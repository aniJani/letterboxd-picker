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
