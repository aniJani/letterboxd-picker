import * as cheerio from "cheerio";
import type { ErrorCode, FilmStub } from "@/lib/types";
import {
  LETTERBOXD_BASE,
  PAGINATION_DELAY_MS,
  RETRY_BACKOFF_MS,
} from "@/lib/config";

export type WatchlistPageResult = {
  films: FilmStub[];
  hasNextPage: boolean;
};

function extractYearFromDisplayName(name: string | undefined): number | null {
  if (!name) return null;
  const m = name.match(/\((\d{4})\)\s*$/);
  if (!m) return null;
  const y = parseInt(m[1]!, 10);
  return Number.isFinite(y) ? y : null;
}

export function parseWatchlistPage(html: string): WatchlistPageResult {
  const $ = cheerio.load(html);
  const films: FilmStub[] = [];
  const seen = new Set<string>();

  const addFilm = (slug: string | undefined, title: string | undefined, year: number | null) => {
    if (!slug || !title) return;
    const cleanSlug = slug.trim();
    const cleanTitle = title.trim();
    if (!cleanSlug || !cleanTitle) return;
    if (seen.has(cleanSlug)) return;
    seen.add(cleanSlug);
    films.push({ slug: cleanSlug, title: cleanTitle, year });
  };

  // Real Letterboxd markup: li.griditem with data-item-slug / data-item-name
  $("li.griditem [data-item-slug]").each((_, el) => {
    const $el = $(el);
    const slug = $el.attr("data-item-slug");
    const title = $el.attr("data-item-name") || $el.attr("data-item-full-display-name");
    const year = extractYearFromDisplayName($el.attr("data-item-full-display-name"));
    addFilm(slug, title, year);
  });

  // Legacy markup: li.poster-container with data-film-slug / data-film-name
  $("li.poster-container [data-film-slug]").each((_, el) => {
    const $el = $(el);
    const slug = $el.attr("data-film-slug");
    const title = $el.attr("data-film-name") || $el.find("img").attr("alt");
    const yearAttr = $el.attr("data-film-release-year");
    const year = yearAttr ? parseInt(yearAttr, 10) : NaN;
    addFilm(slug, title, Number.isFinite(year) ? year : null);
  });

  const hasNextPage =
    $("a.next").length > 0 || $(".paginate-nextprev .next").length > 0;

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
  // Normalise curly/straight apostrophes and HTML entity encodings.
  const normalised = lower
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/[‘’]/g, "'");
  if (
    normalised.includes("sorry, we can't find that page") ||
    normalised.includes("sorry, we can't find the page")
  ) {
    return false;
  }
  if (normalised.includes("404 not found")) return false;
  return true;
}

export function isPrivateWatchlist(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("profile is private") ||
    lower.includes("watchlist is private")
  );
}

export type ScrapeResult<T> =
  | { kind: "ok"; films: T[] }
  | { kind: "error"; code: ErrorCode; message?: string };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const PAGE_FETCH_TIMEOUT_MS = 12_000;

async function fetchPage(
  url: string,
  signal?: AbortSignal,
): Promise<{ status: number; html: string }> {
  // Per-page hard timeout. Letterboxd has been observed to slow-serve
  // (14+ minutes) when an IP is throttled; without this the request
  // hangs indefinitely.
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), PAGE_FETCH_TIMEOUT_MS);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal;
  try {
    const res = await fetch(url, {
      headers: {
        // Browser-like UA — `letterboxd-picker/1.0` triggers throttling.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: combinedSignal,
    });
    const html = await res.text();
    return { status: res.status, html };
  } finally {
    clearTimeout(timer);
  }
}

export async function scrapeWatchlist(
  user: string,
  signal?: AbortSignal,
): Promise<ScrapeResult<FilmStub>> {
  const u = encodeURIComponent(user);
  let page = 1;
  const films: FilmStub[] = [];

  while (true) {
    const url =
      page === 1
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
    if (signal?.aborted) return { kind: "error", code: "NETWORK" };
  }

  if (films.length === 0) return { kind: "error", code: "EMPTY" };
  return { kind: "ok", films };
}

export async function scrapeFilmRating(
  slug: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const url = `${LETTERBOXD_BASE}/film/${slug}/`;
  try {
    const res = await fetchPage(url, signal);
    if (res.status >= 400) return null;
    return parseFilmRating(res.html);
  } catch {
    return null;
  }
}
