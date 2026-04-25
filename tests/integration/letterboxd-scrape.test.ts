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
