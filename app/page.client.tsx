"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorCode, Film, FilterState, StreamEvent } from "@/lib/types";
import { StreamEventSchema } from "@/lib/types";
import { DEFAULT_FILTER_STATE } from "@/lib/config";
import { applyFilters, decadeFromYear, pickRandom } from "@/lib/filter";
import { Header } from "@/components/Header";
import { UsernameInput } from "@/components/UsernameInput";
import { LetterBoard } from "@/components/LetterBoard";
import { PickButton } from "@/components/PickButton";
import { FilmDetails } from "@/components/FilmDetails";
import { ProgressLine } from "@/components/ProgressLine";
import { Colophon } from "@/components/Colophon";

type AppState =
  | { kind: "idle" }
  | { kind: "loading"; user: string; loaded: number; total: number }
  | { kind: "filter"; user: string; films: Film[] }
  | { kind: "result"; user: string; films: Film[]; picked: Film }
  | { kind: "error"; code: ErrorCode; user: string };

const ERROR_COPY: Record<ErrorCode, { title: string; sub: (u: string) => string }> = {
  NOT_FOUND: { title: "NO SUCH PATRON.", sub: u => `@${u} IS NOT ON LETTERBOXD` },
  PRIVATE: { title: "PRIVATE SCREENING.", sub: u => `@${u}'S WATCHLIST IS NOT PUBLIC` },
  EMPTY: { title: "EMPTY QUEUE.", sub: u => `@${u}'S WATCHLIST HAS NO FILMS YET` },
  RATE_LIMIT: { title: "BOX OFFICE CLOSED.", sub: () => "LETTERBOXD IS RATE-LIMITING US — TRY AGAIN IN A MINUTE" },
  NETWORK: { title: "INTERMISSION.", sub: () => "SOMETHING WENT WRONG · CHECK YOUR CONNECTION" },
  PARSER: { title: "INTERMISSION.", sub: () => "SOMETHING WENT WRONG ON OUR SIDE" },
};

const RATE_LIMIT_COOLDOWN_SECONDS = 60;

export function PageClient() {
  const [state, setState] = useState<AppState>({ kind: "idle" });
  const [filter, setFilter] = useState<FilterState>({ ...DEFAULT_FILTER_STATE });
  const abortRef = useRef<AbortController | null>(null);

  const films = state.kind === "filter" || state.kind === "result" ? state.films : [];
  const filtered = useMemo(() => applyFilters(films, filter), [films, filter]);

  const filterOptions = useMemo(() => {
    const genreSet = new Set<string>();
    const decadeSet = new Set<string>();
    for (const f of films) {
      for (const g of f.genres) genreSet.add(g);
      decadeSet.add(decadeFromYear(f.year));
    }
    return {
      genres: ["ANY", ...Array.from(genreSet).sort()],
      decades: ["ANY", ...Array.from(decadeSet).sort((a, b) => b.localeCompare(a))],
    };
  }, [films]);

  const handleEvent = (event: StreamEvent, user: string) => {
    if (event.type === "paginated") setState({ kind: "loading", user, loaded: 0, total: event.total });
    else if (event.type === "progress") setState({ kind: "loading", user, loaded: event.loaded, total: event.total });
    else if (event.type === "done") setState({ kind: "filter", user, films: event.films });
    else if (event.type === "error") setState({ kind: "error", code: event.code, user });
  };

  const submit = useCallback(async (user: string, refresh = false) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ kind: "loading", user, loaded: 0, total: 0 });
    setFilter({ ...DEFAULT_FILTER_STATE });

    try {
      const url = `/api/watchlist?user=${encodeURIComponent(user)}${refresh ? "&refresh=1" : ""}`;
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        setState({ kind: "error", code: "NETWORK", user });
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const parsed = StreamEventSchema.safeParse(JSON.parse(line));
          if (!parsed.success) continue;
          handleEvent(parsed.data, user);
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({ kind: "error", code: "NETWORK", user });
    }
  }, []);

  const onPick = () => {
    if (state.kind !== "filter" && state.kind !== "result") return;
    if (filtered.length === 0) return;
    const lastSlug = state.kind === "result" ? state.picked.slug : undefined;
    const picked = pickRandom(filtered, lastSlug);
    setState({ kind: "result", user: state.user, films: state.films, picked });
  };

  const onReroll = () => onPick();

  const onEditFilters = () => {
    if (state.kind === "result") setState({ kind: "filter", user: state.user, films: state.films });
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  // Rate-limit countdown
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (state.kind === "error" && state.code === "RATE_LIMIT") {
      setCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
      const t = setInterval(() => setCooldown(c => (c > 0 ? c - 1 : 0)), 1000);
      return () => clearInterval(t);
    }
    setCooldown(0);
  }, [state]);

  const isResult = state.kind === "result";

  let progressText = "";
  let progressTone: "default" | "amber" | "muted" = "default";
  if (state.kind === "loading") {
    progressText = state.total > 0 ? `LOADING · ${state.loaded} / ${state.total}` : "LOADING — FETCHING WATCHLIST";
  } else if (state.kind === "filter") {
    if (filtered.length === 0) { progressText = "0 FILMS MATCH — LOOSEN FILTERS"; progressTone = "amber"; }
    else { progressText = `${filtered.length} FILMS MATCH`; progressTone = "muted"; }
  } else if (state.kind === "result") {
    progressText = `PULLED FROM ${filtered.length} FILMS MATCHING YOUR FILTERS`;
    progressTone = "muted";
  }

  const backdrop =
    state.kind === "result" && state.picked.backdropPath
      ? `https://image.tmdb.org/t/p/w1280${state.picked.backdropPath}`
      : null;

  return (
    <>
      {backdrop && (
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10 transition-opacity duration-700"
          style={{
            backgroundImage: `url(${backdrop})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              background:
                "linear-gradient(180deg, rgba(15,12,8,0.65) 0%, rgba(15,12,8,0.78) 50%, rgba(15,12,8,0.92) 100%)",
            }}
          />
        </div>
      )}
      <main
        className={`max-w-[720px] mx-auto px-5 sm:px-10 py-10 min-h-screen ${
          backdrop
            ? "bg-[var(--color-paper)]/95 sm:my-6 sm:rounded-sm sm:shadow-[0_30px_80px_rgba(0,0,0,0.4)]"
            : ""
        }`}
        style={
          backdrop
            ? { backgroundColor: "rgba(239,236,228,0.97)" }
            : undefined
        }
      >
        <Header variant={isResult ? "result" : "idle"} />

      {state.kind !== "result" && (
        <div className="flex items-end gap-3 mb-2">
          <div className="flex-1">
            <UsernameInput onSubmit={(u) => submit(u, false)} disabled={state.kind === "loading"} />
          </div>
          {(state.kind === "filter") && (
            <button
              onClick={() => submit(state.user, true)}
              title="Refresh watchlist (clears cache)"
              className="bg-transparent border-0 font-mono text-[10px] tracking-[0.2em] uppercase opacity-60 hover:opacity-100 cursor-pointer pb-3"
            >
              ↻ refresh watchlist
            </button>
          )}
        </div>
      )}

      {state.kind === "error" ? (
        <div className="bg-[var(--color-board-frame)] p-2 rounded-[3px] my-4">
          <div className="bg-[var(--color-board-bg)] p-6 text-center font-display">
            <div className="font-black text-[28px] sm:text-[36px] tracking-[0.06em] uppercase text-[var(--color-board-letter)]">{ERROR_COPY[state.code].title}</div>
            <div className="font-mono text-[11px] tracking-[0.2em] mt-3 text-[var(--color-amber)] uppercase">{ERROR_COPY[state.code].sub(state.user)}</div>
            {state.code === "PRIVATE" && (
              <a
                href="https://letterboxd.com/about/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-board-letter)] underline"
              >
                How to make a watchlist public ↗
              </a>
            )}
          </div>
        </div>
      ) : state.kind === "result" ? (
        <LetterBoard mode="result" film={state.picked} />
      ) : (
        <LetterBoard mode="filter" state={filter} options={filterOptions} onChange={setFilter} />
      )}

      {progressText && <ProgressLine text={progressText} tone={progressTone} />}

      {(state.kind === "filter" || state.kind === "loading") && (
        <PickButton
          onClick={onPick}
          disabled={state.kind === "loading" || filtered.length === 0}
        />
      )}

      {state.kind === "result" && (
        <>
          <FilmDetails film={state.picked} onReroll={onReroll} rerollDisabled={filtered.length <= 1} />
          <button
            onClick={onEditFilters}
            className="block mx-auto mt-6 bg-transparent border-0 font-mono text-[11px] tracking-[0.2em] uppercase opacity-60 hover:opacity-100 cursor-pointer"
          >
            ← Edit filters
          </button>
        </>
      )}

      {state.kind === "error" && (
        <button
          onClick={() => submit(state.user, true)}
          disabled={state.code === "RATE_LIMIT" && cooldown > 0}
          className="block w-full mt-6 py-3 bg-[var(--color-ink)] text-[var(--color-paper)] font-display font-bold text-[11px] tracking-[0.2em] uppercase border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state.code === "RATE_LIMIT" && cooldown > 0 ? `↻ Try again in ${cooldown}s` : "↻ Try again"}
        </button>
      )}

      <Colophon />
      </main>
    </>
  );
}
