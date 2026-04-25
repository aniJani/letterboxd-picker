import { NextResponse } from "next/server";
import type { Film, StreamEvent } from "@/lib/types";
import { scrapeWatchlist } from "@/lib/letterboxd";
import { enrich } from "@/lib/enrich";
import { readCachedWatchlist, writeCachedWatchlist } from "@/lib/cache";
import { MIN_USERNAME_LENGTH, MAX_USERNAME_LENGTH } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9_]{2,15}$/;

function ndjson(event: StreamEvent): string {
  return JSON.stringify(event) + "\n";
}

function streamResponse(generator: () => AsyncIterable<StreamEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of generator()) {
          controller.enqueue(encoder.encode(ndjson(event)));
        }
      } catch {
        controller.enqueue(encoder.encode(ndjson({ type: "error", code: "NETWORK" })));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const user = (url.searchParams.get("user") ?? "").trim().toLowerCase();
  const refresh = url.searchParams.get("refresh") === "1";

  if (
    !USERNAME_RE.test(user) ||
    user.length < MIN_USERNAME_LENGTH ||
    user.length > MAX_USERNAME_LENGTH
  ) {
    return NextResponse.json({ error: "invalid username" }, { status: 400 });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  return streamResponse(async function* () {
    if (!refresh) {
      const cached = await readCachedWatchlist(user);
      if (cached) {
        yield { type: "paginated", total: cached.films.length };
        yield { type: "progress", loaded: cached.films.length, total: cached.films.length };
        yield { type: "done", films: cached.films };
        return;
      }
    }

    const scrape = await scrapeWatchlist(user);
    if (scrape.kind === "error") {
      yield { type: "error", code: scrape.code };
      return;
    }

    yield { type: "paginated", total: scrape.films.length };

    const queue: StreamEvent[] = [];
    const films: Film[] = await enrich(scrape.films, {
      apiKey,
      onProgress: (loaded, total) => queue.push({ type: "progress", loaded, total }),
    });

    for (const event of queue) yield event;

    yield { type: "done", films };
    await writeCachedWatchlist(user, films, scrape.films.length);
  });
}
