"use client";

import { useCallback, useEffect, useRef } from "react";

export type FilterColumnProps = {
  label: string;
  options: string[];
  value: string;
  onChange: (next: string) => void;
};

// Wheel-delta accumulator threshold. Trackpads fire wheel events at ~60Hz with
// small deltas; without a threshold each tiny scroll moves through many options.
const WHEEL_THRESHOLD = 40;
// Reset the typeahead buffer if the user pauses for this long (matches OS file
// browsers — type "wal" within 800ms to find Wallflower; pause longer and you
// start a new search).
const TYPEAHEAD_RESET_MS = 800;

export function FilterColumn({ label, options, value, onChange }: FilterColumnProps) {
  const idx = Math.max(0, options.indexOf(value));
  const advance = useCallback((delta: number) => {
    if (options.length === 0) return;
    const next = (idx + delta + options.length) % options.length;
    const target = options[next];
    if (target !== undefined && target !== value) onChange(target);
  }, [idx, options, onChange, value]);

  // Jump to the first option (wrapping if needed) whose name starts with the
  // typeahead buffer (case-insensitive).
  const jumpTo = useCallback(
    (buf: string) => {
      if (!buf || options.length === 0) return;
      const lower = buf.toLowerCase();
      // Search from the option AFTER the current one so repeated key strokes
      // cycle through matches ("W" → Western → War → Western again).
      const start = (idx + 1) % options.length;
      for (let step = 0; step < options.length; step++) {
        const probe = options[(start + step) % options.length];
        if (probe && probe.toLowerCase().startsWith(lower)) {
          if (probe !== value) onChange(probe);
          return;
        }
      }
    },
    [idx, options, onChange, value],
  );

  const ref = useRef<HTMLDivElement>(null);
  const wheelAccum = useRef(0);
  const typeaheadBuf = useRef("");
  const typeaheadAt = useRef(0);

  // React 19 attaches wheel listeners as passive, so preventDefault is a no-op
  // when set via JSX. Attach a non-passive native listener to actually trap
  // page scroll while the user spins the column.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelAccum.current += e.deltaY;
      while (wheelAccum.current >= WHEEL_THRESHOLD) {
        wheelAccum.current -= WHEEL_THRESHOLD;
        advance(1);
      }
      while (wheelAccum.current <= -WHEEL_THRESHOLD) {
        wheelAccum.current += WHEEL_THRESHOLD;
        advance(-1);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [advance]);

  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); advance(1); return; }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); advance(-1); return; }
        // Typeahead: single printable character (letter or digit), no modifiers.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = Date.now();
          if (now - typeaheadAt.current > TYPEAHEAD_RESET_MS) typeaheadBuf.current = "";
          typeaheadBuf.current += e.key;
          typeaheadAt.current = now;
          jumpTo(typeaheadBuf.current);
        }
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
