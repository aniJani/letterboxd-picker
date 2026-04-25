"use client";

import { useEffect, useId, useState } from "react";
import { MAX_USERNAME_LENGTH, MIN_USERNAME_LENGTH } from "@/lib/config";

const STORAGE_KEY = "lbxp:lastUser";
const RE = /^[a-z0-9_]+$/;

function normalise(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\/(www\.)?letterboxd\.com\//, "");
  s = s.replace(/^@/, "");
  s = s.replace(/\/.*$/, "");
  return s;
}

export type UsernameInputProps = {
  onSubmit: (user: string) => void;
  disabled?: boolean;
};

export function UsernameInput({ onSubmit, disabled }: UsernameInputProps) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setValue(stored);
    } catch {}
  }, []);

  const validate = (raw: string): string | null => {
    const v = normalise(raw);
    if (v.length === 0) return null;
    if (v.length < MIN_USERNAME_LENGTH || v.length > MAX_USERNAME_LENGTH) return "INVALID HANDLE";
    if (!RE.test(v)) return "INVALID HANDLE";
    return null;
  };

  const submit = () => {
    const v = normalise(value);
    const err = validate(value);
    if (err || v.length === 0) {
      setError(err ?? "ENTER A HANDLE");
      return;
    }
    setError(null);
    try { localStorage.setItem(STORAGE_KEY, v); } catch {}
    onSubmit(v);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="font-display font-black text-[28px] text-[var(--color-ink)]">@</label>
        <input
          id={id}
          type="text"
          value={value}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder="your_username"
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          onBlur={submit}
          className="flex-1 bg-transparent border-0 border-b-2 border-[var(--color-ink)] py-2 font-display text-[22px] font-bold tracking-[0.02em] text-[var(--color-ink)] outline-none disabled:opacity-50"
        />
      </div>
      {error && (
        <div className="font-mono text-[11px] tracking-[0.2em] text-[var(--color-accent)] mt-2">{error}</div>
      )}
    </div>
  );
}
