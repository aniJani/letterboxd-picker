"use client";

import type { Film } from "@/lib/types";

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

export type FilmDetailsProps = {
  film: Film;
  onReroll: () => void;
  rerollDisabled?: boolean;
};

export function FilmDetails({ film, onReroll, rerollDisabled }: FilmDetailsProps) {
  const poster = film.posterPath ? TMDB_IMG + film.posterPath : null;
  return (
    <>
      <div className="grid grid-cols-[180px_1fr] sm:grid-cols-[200px_1fr] gap-5 mt-5">
        <div className="aspect-[2/3] bg-[#2a1f1f] rounded-sm overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {poster && <img src={poster} alt={`${film.title} poster`} className="w-full h-full object-cover" loading="lazy" />}
        </div>
        <div className="text-[13px] leading-[1.5] opacity-90">
          <div className="font-black text-[11px] tracking-[0.15em] uppercase mb-2">Dir. {film.director}</div>
          <p>{film.synopsis}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button
          onClick={onReroll}
          disabled={rerollDisabled}
          className="flex-1 py-3 bg-[var(--color-paper)] text-[var(--color-ink)] border-2 border-[var(--color-ink)] font-display font-bold text-[11px] tracking-[0.2em] uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ↻ Reroll
        </button>
        <a
          href={film.letterboxdUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-3 bg-[var(--color-ink)] text-[var(--color-paper)] border-2 border-[var(--color-ink)] font-display font-bold text-[11px] tracking-[0.2em] uppercase text-center no-underline"
        >
          View on Letterboxd ↗
        </a>
      </div>
    </>
  );
}
