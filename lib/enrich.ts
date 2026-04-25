import type { Film, FilmStub } from "@/lib/types";
import type { TmdbMovie } from "@/lib/tmdb";
import { searchByTitleYear, getMovie } from "@/lib/tmdb";
import { ENRICH_CONCURRENCY, LETTERBOXD_BASE, PROGRESS_THROTTLE } from "@/lib/config";

export type EnrichDeps = {
  apiKey: string;
  tmdbSearch?: (title: string, year: number | null, apiKey: string) => Promise<number | null>;
  tmdbGet?: (id: number, apiKey: string) => Promise<TmdbMovie | null>;
  // Optional injection used only by tests that want to override the rating
  // (which now comes from TMDB itself, so the default has no I/O).
  ratingOverride?: (slug: string, signal?: AbortSignal) => Promise<number | null>;
  onProgress?: (loaded: number, total: number) => void;
  concurrency?: number;
  progressEvery?: number;
  signal?: AbortSignal;
};

export async function enrich(stubs: FilmStub[], deps: EnrichDeps): Promise<Film[]> {
  const search = deps.tmdbSearch ?? searchByTitleYear;
  const fetchMovie = deps.tmdbGet ?? getMovie;
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
      if (deps.signal?.aborted) return;
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

      const rating = deps.ratingOverride
        ? await deps.ratingOverride(stub.slug, deps.signal)
        : movie.rating;

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
