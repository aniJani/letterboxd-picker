export const CACHE_VERSION = "v1";
export const CACHE_TTL_SECONDS = 60 * 60 * 6; // 6 hours
export const ENRICH_CONCURRENCY = 10;
export const FILM_PAGE_TIMEOUT_MS = 5_000;
export const PAGINATION_DELAY_MS = 200;
export const RETRY_BACKOFF_MS = 500;
export const MAX_USERNAME_LENGTH = 15;
export const MIN_USERNAME_LENGTH = 2;
export const PROGRESS_THROTTLE = 5;

export const DEFAULT_FILTER_STATE = {
  genre: "ANY",
  decade: "ANY",
  minRating: 0,
} as const;

export const TMDB_API_BASE = "https://api.themoviedb.org/3";
export const LETTERBOXD_BASE = "https://letterboxd.com";
