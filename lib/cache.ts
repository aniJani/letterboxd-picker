import { kv } from "@vercel/kv";
import type { Film } from "@/lib/types";
import { CachedWatchlistSchema } from "@/lib/types";
import { CACHE_VERSION, CACHE_TTL_SECONDS } from "@/lib/config";

export function cacheKey(user: string): string {
  return `wl:${CACHE_VERSION}:${user.toLowerCase()}`;
}

export async function readCachedWatchlist(user: string) {
  try {
    const raw = await kv.get(cacheKey(user));
    if (!raw) return null;
    const parsed = CachedWatchlistSchema.safeParse(raw);
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function writeCachedWatchlist(
  user: string,
  films: Film[],
  sourceCount: number,
): Promise<void> {
  try {
    await kv.set(
      cacheKey(user),
      { films, scrapedAt: Date.now(), sourceCount },
      { ex: CACHE_TTL_SECONDS },
    );
  } catch {}
}
