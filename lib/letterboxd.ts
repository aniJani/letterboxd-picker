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
  totalPages: number | null;
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

  // Read every numbered pagination link and take the largest — that's the
  // last page. Lets us fan out the rest in parallel instead of paginating
  // serially.
  let totalPages: number | null = null;
  $(".paginate-page a, .paginate-page").each((_, el) => {
    const text = $(el).text().trim();
    const n = parseInt(text, 10);
    if (Number.isFinite(n) && (totalPages === null || n > totalPages)) {
      totalPages = n;
    }
  });

  return { films, hasNextPage, totalPages };
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

const PAGINATION_PARALLEL = 5;

function pageUrl(user: string, page: number): string {
  const u = encodeURIComponent(user);
  return page === 1
    ? `${LETTERBOXD_BASE}/${u}/watchlist/`
    : `${LETTERBOXD_BASE}/${u}/watchlist/page/${page}/`;
}

async function fetchAndCheck(
  url: string,
  signal?: AbortSignal,
): Promise<{ status: number; html: string } | { error: ErrorCode }> {
  let res;
  try {
    res = await fetchPage(url, signal);
  } catch {
    return { error: "NETWORK" };
  }
  if (res.status === 429) return { error: "RATE_LIMIT" };
  if (res.status === 403) return { error: "PRIVATE" };
  if (res.status === 404) return { error: "NOT_FOUND" };
  if (res.status >= 500) {
    await sleep(RETRY_BACKOFF_MS);
    try {
      res = await fetchPage(url, signal);
    } catch {
      return { error: "NETWORK" };
    }
    if (res.status >= 500) return { error: "NETWORK" };
  }
  return res;
}

export async function scrapeWatchlist(
  user: string,
  signal?: AbortSignal,
): Promise<ScrapeResult<FilmStub>> {
  // Page 1: fetch synchronously to learn the total page count and detect errors.
  const t0 = Date.now();
  const first = await fetchAndCheck(pageUrl(user, 1), signal);
  if ("error" in first) {
    console.error(`[scrape] page 1 failed: ${first.error}`);
    return { kind: "error", code: first.error };
  }
  console.log(`[scrape] page 1 fetched in ${Date.now() - t0}ms, status=${first.status}`);

  if (isPrivateWatchlist(first.html)) return { kind: "error", code: "PRIVATE" };
  if (first.status === 404 || !parseUserExists(first.html)) {
    return { kind: "error", code: "NOT_FOUND" };
  }

  const firstParsed = parseWatchlistPage(first.html);
  console.log(`[scrape] page 1 has ${firstParsed.films.length} films, totalPages=${firstParsed.totalPages}, hasNext=${firstParsed.hasNextPage}`);

  if (firstParsed.films.length === 0) return { kind: "error", code: "EMPTY" };

  const films: FilmStub[] = [...firstParsed.films];
  const totalPages = firstParsed.totalPages ?? 1;

  // Fan out pages 2..N in parallel batches.
  if (totalPages > 1) {
    const remaining: number[] = [];
    for (let p = 2; p <= totalPages; p++) remaining.push(p);

    const batchT0 = Date.now();
    const pageResults: Array<FilmStub[] | null> = new Array(totalPages + 1).fill(null);

    let cursor = 0;
    async function worker() {
      while (cursor < remaining.length) {
        if (signal?.aborted) return;
        const idx = cursor++;
        const p = remaining[idx]!;
        const r = await fetchAndCheck(pageUrl(user, p), signal);
        if ("error" in r) {
          console.warn(`[scrape] page ${p} skipped: ${r.error}`);
          continue;
        }
        const parsed = parseWatchlistPage(r.html);
        if (parsed.films.length === 0) {
          // Past the end (Letterboxd serves empty 80KB pages past last). Skip.
          continue;
        }
        pageResults[p] = parsed.films;
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(PAGINATION_PARALLEL, remaining.length) }, () => worker()),
    );

    if (signal?.aborted) return { kind: "error", code: "NETWORK" };

    // Reassemble pages in order.
    for (let p = 2; p <= totalPages; p++) {
      const got = pageResults[p];
      if (got) films.push(...got);
    }
    console.log(`[scrape] pages 2..${totalPages} fetched in ${Date.now() - batchT0}ms (${PAGINATION_PARALLEL}-way parallel)`);
  }

  console.log(`[scrape] done — ${totalPages} pages, ${films.length} films`);
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
