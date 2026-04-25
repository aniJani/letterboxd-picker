import type { Film, FilterState } from "@/lib/types";
import { defaultRng, type Rng } from "@/lib/rng";

export function decadeFromYear(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

export function applyFilters(films: Film[], state: FilterState): Film[] {
  return films.filter(f => {
    if (state.genre !== "ANY" && !f.genres.includes(state.genre)) return false;
    if (state.decade !== "ANY" && decadeFromYear(f.year) !== state.decade) return false;
    if (state.minRating > 0) {
      if (f.lbxRating === null) return false;
      if (f.lbxRating < state.minRating) return false;
    }
    return true;
  });
}

export function pickRandom(pool: Film[], exclude: string | undefined, rng: Rng = defaultRng): Film {
  if (pool.length === 0) {
    throw new Error("pickRandom: empty pool");
  }
  if (pool.length === 1) {
    return pool[0]!;
  }
  const candidates = exclude ? pool.filter(f => f.slug !== exclude) : pool;
  const effective = candidates.length > 0 ? candidates : pool;
  const idx = Math.floor(rng() * effective.length);
  return effective[idx]!;
}
