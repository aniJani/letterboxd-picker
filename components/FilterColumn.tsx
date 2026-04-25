"use client";

import { useCallback } from "react";

export type FilterColumnProps = {
  label: string;
  options: string[];
  value: string;
  onChange: (next: string) => void;
};

export function FilterColumn({ label, options, value, onChange }: FilterColumnProps) {
  const idx = Math.max(0, options.indexOf(value));
  const advance = useCallback((delta: number) => {
    if (options.length === 0) return;
    const next = (idx + delta + options.length) % options.length;
    const target = options[next];
    if (target !== undefined && target !== value) onChange(target);
  }, [idx, options, onChange, value]);

  return (
    <div
      role="listbox"
      tabIndex={0}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); advance(1); }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); advance(-1); }
      }}
      onWheel={(e) => {
        e.preventDefault();
        advance(e.deltaY > 0 ? 1 : -1);
      }}
      className="flex flex-col items-center gap-1 select-none focus:outline-none focus:ring-2 focus:ring-amber"
    >
      <div
        className="text-[10px] tracking-[0.25em] text-[var(--color-muted)] font-mono"
      >
        {label}
      </div>
      <button
        aria-label={`${label} previous`}
        onClick={() => advance(-1)}
        className="text-[12px] text-[var(--color-muted)] hover:text-[var(--color-board-letter)] cursor-pointer bg-transparent border-0 p-0"
      >
        ▲
      </button>
      <div
        className="font-display font-black uppercase text-[24px] sm:text-[28px] tracking-[0.08em] text-[var(--color-board-letter)] min-h-[1.2em]"
        aria-live="polite"
      >
        {value}
      </div>
      <button
        aria-label={`${label} next`}
        onClick={() => advance(1)}
        className="text-[12px] text-[var(--color-muted)] hover:text-[var(--color-board-letter)] cursor-pointer bg-transparent border-0 p-0"
      >
        ▼
      </button>
    </div>
  );
}
