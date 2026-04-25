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
