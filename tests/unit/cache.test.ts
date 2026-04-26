import { describe, expect, it, vi, beforeEach } from "vitest";
import { readCachedWatchlist, writeCachedWatchlist, cacheKey } from "@/lib/cache";
import type { Film } from "@/lib/types";

const film: Film = {
  slug: "the-thing", title: "The Thing", year: 1982, lbxRating: 4.1,
  tmdbId: 1091, genres: ["Horror"], runtime: 109, director: "Carpenter",
  posterPath: "/x.jpg", backdropPath: "/b.jpg", synopsis: "...", letterboxdUrl: "https://letterboxd.com/film/the-thing/",
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
