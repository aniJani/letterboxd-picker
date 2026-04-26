import { z } from "zod";

export const FilmSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  year: z.number().int().min(1888).max(2100),
  lbxRating: z.number().min(0).max(5).nullable(),
  tmdbId: z.number().int().positive(),
  genres: z.array(z.string()),
  runtime: z.number().int().positive(),
  director: z.string(),
  posterPath: z.string().nullable(),
  backdropPath: z.string().nullable(),
  synopsis: z.string(),
  letterboxdUrl: z.string().url(),
});
export type Film = z.infer<typeof FilmSchema>;

export const FilmStubSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  year: z.number().int().nullable(),
});
export type FilmStub = z.infer<typeof FilmStubSchema>;

export const FilterStateSchema = z.object({
  genre: z.string(),
  decade: z.string(),
  minRating: z.number().min(0).max(5),
});
export type FilterState = z.infer<typeof FilterStateSchema>;

export const ErrorCodeSchema = z.enum(["NOT_FOUND", "PRIVATE", "EMPTY", "RATE_LIMIT", "NETWORK", "PARSER"]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paginated"), total: z.number().int().nonnegative() }),
  z.object({ type: z.literal("progress"), loaded: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
  z.object({ type: z.literal("done"), films: z.array(FilmSchema) }),
  z.object({ type: z.literal("error"), code: ErrorCodeSchema, message: z.string().optional() }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;

export const CachedWatchlistSchema = z.object({
  films: z.array(FilmSchema),
  scrapedAt: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
});
export type CachedWatchlist = z.infer<typeof CachedWatchlistSchema>;
