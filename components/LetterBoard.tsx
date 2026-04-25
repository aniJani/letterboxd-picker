"use client";

import { useEffect, useMemo, useState } from "react";
import type { Film, FilterState } from "@/lib/types";
import { FilterColumn } from "@/components/FilterColumn";

type FilterModeProps = {
  mode: "filter";
  state: FilterState;
  options: { genres: string[]; decades: string[] };
  onChange: (next: FilterState) => void;
};

type ResultModeProps = {
  mode: "result";
  film: Film;
};

type Props = FilterModeProps | ResultModeProps;

const RATING_OPTIONS = ["ANY", "0.5+", "1.0+", "1.5+", "2.0+", "2.5+", "3.0+", "3.5+", "4.0+", "4.5+", "5.0"];

function ratingLabel(value: number): string {
  if (value === 0) return "ANY";
  if (value === 5) return "5.0";
  return `${value.toFixed(1)}+`;
}

function ratingFromLabel(label: string): number {
  if (label === "ANY") return 0;
  if (label === "5.0") return 5;
  return parseFloat(label.replace("+", ""));
}

function FrameWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-board-frame)] p-2 rounded-[3px] shadow-[0_4px_0_#2c1d0e,0_12px_24px_rgba(0,0,0,0.3)]">
      <div className="bg-[var(--color-board-bg)] border border-[#1a1a1a] px-6 pt-6 pb-5 relative font-display"
        style={{
          backgroundImage: "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.02) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.02) 0%, transparent 40%)",
        }}>
        <Pinstripes />
        {children}
      </div>
    </div>
  );
}

function Pinstripes() {
  return (
    <>
      <div className="absolute left-6 right-6 top-2 h-1.5" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 14px, #2a2a2a 14px 18px)" }} />
      <div className="absolute left-6 right-6 bottom-2 h-1.5" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 14px, #2a2a2a 14px 18px)" }} />
    </>
  );
}

function FilterMode({ state, options, onChange }: FilterModeProps) {
  return (
    <FrameWrapper>
      <div className="flex justify-between font-mono text-[10px] tracking-[0.3em] text-[var(--color-muted)] mb-3 px-1">
        <span>SET YOUR FILTERS</span>
        <span>SCROLL ↑↓</span>
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-2 px-1 py-1">
        <FilterColumn
          label="GENRE"
          options={options.genres}
          value={state.genre}
          onChange={(genre) => onChange({ ...state, genre })}
        />
        <FilterColumn
          label="DECADE"
          options={options.decades}
          value={state.decade}
          onChange={(decade) => onChange({ ...state, decade })}
        />
        <FilterColumn
          label="MIN RATING"
          options={RATING_OPTIONS}
          value={ratingLabel(state.minRating)}
          onChange={(label) => onChange({ ...state, minRating: ratingFromLabel(label) })}
        />
      </div>
      <div className="font-mono text-[10px] tracking-[0.4em] text-[#555] text-center mt-4">— NOW SHOWING —</div>
    </FrameWrapper>
  );
}

function ResultMode({ film }: ResultModeProps) {
  const surname = film.director.split(" ").pop()?.toUpperCase() ?? "";
  const titleLetters = useMemo(() => film.title.toUpperCase().split(""), [film.title]);
  const [shownLetters, setShownLetters] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShownLetters(titleLetters.length);
      return;
    }
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setShownLetters(i);
      if (i >= titleLetters.length) clearInterval(interval);
    }, 80);
    return () => clearInterval(interval);
  }, [titleLetters]);

  const rating = film.lbxRating;
  const stars = rating !== null ? "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating)) : "";

  return (
    <FrameWrapper>
      <div className="flex justify-between font-mono text-[10px] tracking-[0.3em] text-[var(--color-muted)] mb-3 px-1">
        <span>FEATURE PRESENTATION</span>
        {rating !== null && <span>★ {rating.toFixed(1)} / 5</span>}
      </div>
      <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--color-amber)] text-center mb-3">— NOW SHOWING —</div>
      <div className="font-display font-black uppercase text-center text-[36px] sm:text-[44px] tracking-[0.06em] leading-[0.95] text-[var(--color-board-letter)] min-h-[1.2em]">
        {titleLetters.slice(0, shownLetters).join("")}
      </div>
      <div className="font-mono text-[11px] tracking-[0.2em] text-[#aaa] text-center mt-3 uppercase">
        {surname} · {film.year} · {film.runtime}<span className="lowercase opacity-70">min</span>
      </div>
      {stars && (
        <div className="font-mono text-[12px] tracking-[0.3em] text-[var(--color-amber)] text-center mt-2">{stars}</div>
      )}
    </FrameWrapper>
  );
}

export function LetterBoard(props: Props) {
  if (props.mode === "filter") return <FilterMode {...props} />;
  return <ResultMode key={props.film.slug} {...props} />;
}
