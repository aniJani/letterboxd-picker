import * as cheerio from "cheerio";
import type { FilmStub } from "@/lib/types";

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
