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
      let count = 0;
      let closed = false;
      const safeEnqueue = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(ndjson(event)));
        } catch {
          // Client disconnected — controller is already closed.
          closed = true;
        }
      };
      try {
        for await (const event of generator()) {
          if (closed) break;
          count += 1;
          console.log(`[route] enqueue #${count}: ${event.type}${event.type === "done" ? ` (${event.films.length} films)` : event.type === "paginated" ? ` total=${event.total}` : event.type === "progress" ? ` ${event.loaded}/${event.total}` : event.type === "error" ? ` code=${event.code}` : ""}`);
          safeEnqueue(event);
        }
        console.log(`[route] generator completed, ${count} events`);
      } catch (err) {
        console.error("[route] generator threw:", err);
        safeEnqueue({ type: "error", code: "NETWORK" });
      } finally {
        closed = true;
        try { controller.close(); } catch {}
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

  const signal = req.signal;

  return streamResponse(async function* () {
    console.log(`[route] start user=${user} refresh=${refresh}`);
    if (!refresh) {
      const cached = await readCachedWatchlist(user);
      if (cached) {
        console.log(`[route] cache HIT, ${cached.films.length} films`);
        yield { type: "paginated", total: cached.films.length };
        yield { type: "progress", loaded: cached.films.length, total: cached.films.length };
        yield { type: "done", films: cached.films };
        return;
      }
      console.log(`[route] cache MISS`);
    }

    console.log(`[route] scraping...`);
    const scrape = await scrapeWatchlist(user, signal);
    console.log(`[route] scrape result kind=${scrape.kind}${scrape.kind === "ok" ? ` films=${scrape.films.length}` : ` code=${scrape.code}`}`);
    if (scrape.kind === "error") {
      yield { type: "error", code: scrape.code };
      return;
    }

    yield { type: "paginated", total: scrape.films.length };

    // Async channel: progress events from `enrich`'s onProgress callback get
    // yielded to the client as soon as they arrive, instead of being buffered
    // until enrich completes.
    const queue: StreamEvent[] = [];
    let waiter: ((v: IteratorResult<StreamEvent>) => void) | null = null;
    let closed = false;
    const push = (e: StreamEvent) => {
      if (waiter) {
        const w = waiter;
        waiter = null;
        w({ value: e, done: false });
      } else {
        queue.push(e);
      }
    };
    const close = () => {
      closed = true;
      if (waiter) {
        const w = waiter;
        waiter = null;
        w({ value: undefined as unknown as StreamEvent, done: true });
      }
    };
    const next = (): Promise<IteratorResult<StreamEvent>> => {
      if (queue.length > 0) {
        return Promise.resolve({ value: queue.shift()!, done: false });
      }
      if (closed) {
        return Promise.resolve({ value: undefined as unknown as StreamEvent, done: true });
      }
      return new Promise(resolve => { waiter = resolve; });
    };

    console.log(`[route] enriching ${scrape.films.length} stubs...`);
    const enrichPromise = enrich(scrape.films, {
      apiKey,
      onProgress: (loaded, total) => push({ type: "progress", loaded, total }),
      signal,
    })
      .then(films => {
        console.log(`[route] enrich done, ${films.length} films survived`);
        push({ type: "done", films });
        close();
        return films;
      })
      .catch(err => {
        console.error("[route] enrich failed:", err);
        push({ type: "error", code: "NETWORK" });
        close();
        return [] as Film[];
      });

    while (true) {
      const r = await next();
      if (r.done) break;
      yield r.value;
    }

    const films = await enrichPromise;
    if (films.length > 0) {
      await writeCachedWatchlist(user, films, scrape.films.length);
    }
  });
}
