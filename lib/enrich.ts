import type { Film, FilmStub } from "@/lib/types";
import type { TmdbMovie } from "@/lib/tmdb";
import { searchByTitleYear, getMovie } from "@/lib/tmdb";
import { scrapeFilmRating } from "@/lib/letterboxd";
import {
  ENRICH_CONCURRENCY,
  FILM_PAGE_TIMEOUT_MS,
  LETTERBOXD_BASE,
  PROGRESS_THROTTLE,
} from "@/lib/config";

export type EnrichDeps = {
  apiKey: string;
  tmdbSearch?: (title: string, year: number | null, apiKey: string) => Promise<number | null>;
  tmdbGet?: (id: number, apiKey: string) => Promise<TmdbMovie | null>;
  ratingFetch?: (slug: string, signal?: AbortSignal) => Promise<number | null>;
  onProgress?: (loaded: number, total: number) => void;
  concurrency?: number;
  progressEvery?: number;
  signal?: AbortSignal;
};

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null as T | null), ms);
    p.then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null as T | null);
      },
    );
  });
}

export async function enrich(stubs: FilmStub[], deps: EnrichDeps): Promise<Film[]> {
  const search = deps.tmdbSearch ?? searchByTitleYear;
  const fetchMovie = deps.tmdbGet ?? getMovie;
  const fetchRating = deps.ratingFetch ?? scrapeFilmRating;
  const concurrency = deps.concurrency ?? ENRICH_CONCURRENCY;
  const progressEvery = deps.progressEvery ?? PROGRESS_THROTTLE;

  const results: (Film | null)[] = new Array(stubs.length).fill(null);
  let loaded = 0;
  let nextEmit = progressEvery;

  const indices = stubs.map((_, i) => i);

  function emitProgress() {
    if (loaded >= nextEmit || loaded === stubs.length) {
      deps.onProgress?.(loaded, stubs.length);
      nextEmit = loaded + progressEvery;
    }
  }

  async function worker() {
    while (indices.length > 0) {
      const i = indices.shift();
      if (i === undefined) return;
      const stub = stubs[i]!;

      const tmdbId = await search(stub.title, stub.year, deps.apiKey);
      if (tmdbId === null) {
        loaded += 1;
        emitProgress();
        continue;
      }
      const movie = await fetchMovie(tmdbId, deps.apiKey);
      if (movie === null) {
        loaded += 1;
        emitProgress();
        continue;
      }
      const rating = await withTimeout(
        fetchRating(stub.slug, deps.signal),
        FILM_PAGE_TIMEOUT_MS,
      );

      results[i] = {
        slug: stub.slug,
        title: movie.title,
        year: movie.year,
        lbxRating: rating,
        tmdbId: movie.tmdbId,
        genres: movie.genres,
        runtime: movie.runtime,
        director: movie.director,
        posterPath: movie.posterPath,
        synopsis: movie.synopsis,
        letterboxdUrl: `${LETTERBOXD_BASE}/film/${stub.slug}/`,
      };
      loaded += 1;
      emitProgress();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, stubs.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results.filter((f): f is Film => f !== null);
}
