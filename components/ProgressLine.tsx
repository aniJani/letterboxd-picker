export type ProgressLineProps = {
  text: string;
  tone?: "default" | "amber" | "muted";
};

export function ProgressLine({ text, tone = "default" }: ProgressLineProps) {
  const colour = tone === "amber" ? "var(--color-amber)" : tone === "muted" ? "var(--color-muted)" : "var(--color-ink)";
  return (
    <div
      className="text-[10px] font-mono tracking-[0.3em] uppercase mt-3 text-center"
      style={{ color: colour, opacity: tone === "muted" ? 0.5 : 0.85 }}
    >
      {text}
    </div>
  );
}
