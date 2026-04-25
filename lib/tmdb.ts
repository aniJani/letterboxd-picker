import { TMDB_API_BASE, RETRY_BACKOFF_MS } from "@/lib/config";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type TmdbSearchResponse = {
  results: Array<{ id: number; title: string; release_date?: string }>;
};

type TmdbMovieResponse = {
  id: number;
  title: string;
  release_date?: string;
  runtime?: number | null;
  overview?: string;
  poster_path?: string | null;
  genres?: Array<{ id: number; name: string }>;
  credits?: {
    crew?: Array<{ job: string; name: string }>;
  };
};

export type TmdbMovie = {
  tmdbId: number;
  title: string;
  year: number;
  runtime: number;
  director: string;
  genres: string[];
  posterPath: string | null;
  synopsis: string;
};

async function tmdbFetch(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<Response | null> {
  const url = new URL(TMDB_API_BASE + path);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url.toString());
      if (res.status >= 500 && attempt === 0) {
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      return res;
    } catch {
      if (attempt === 0) {
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      return null;
    }
  }
  return null;
}

export async function searchByTitleYear(
  title: string,
  year: number | null,
  apiKey: string,
): Promise<number | null> {
  const params: Record<string, string> = { query: title };
  if (year !== null) params.year = String(year);

  const res = await tmdbFetch("/search/movie", params, apiKey);
  if (!res || !res.ok) return null;

  const data = (await res.json()) as TmdbSearchResponse;
  if (!data.results || data.results.length === 0) return null;
  return data.results[0]!.id;
}

export async function getMovie(
  tmdbId: number,
  apiKey: string,
): Promise<TmdbMovie | null> {
  const res = await tmdbFetch(
    `/movie/${tmdbId}`,
    { append_to_response: "credits" },
    apiKey,
  );
  if (!res || !res.ok) return null;

  const data = (await res.json()) as TmdbMovieResponse;
  if (!data.id) return null;

  const year = data.release_date ? parseInt(data.release_date.slice(0, 4), 10) : NaN;
  if (!Number.isFinite(year)) return null;
  if (typeof data.runtime !== "number" || data.runtime <= 0) return null;

  const director = data.credits?.crew?.find(c => c.job === "Director")?.name ?? "";

  return {
    tmdbId: data.id,
    title: data.title,
    year,
    runtime: data.runtime,
    director,
    genres: (data.genres ?? []).map(g => g.name),
    posterPath: data.poster_path ?? null,
    synopsis: data.overview ?? "",
  };
}
