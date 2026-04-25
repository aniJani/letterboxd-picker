export type HeaderProps = {
  variant?: "idle" | "result";
};

export function Header({ variant = "idle" }: HeaderProps) {
  return (
    <header>
      <div className="flex justify-between items-baseline text-[10px] font-bold tracking-[0.25em] uppercase">
        <span>Letterboxd · Watchlist Picker</span>
        <span className="text-[var(--color-accent)]">№ 042</span>
      </div>
      <div className="h-[2px] bg-[var(--color-ink)] my-3" />
      {variant === "idle" ? (
        <>
          <h1 className="font-display font-black text-[44px] sm:text-[64px] leading-[0.88] tracking-[-0.04em] my-3">
            PICK ME<br />A FILM<span className="text-[var(--color-accent)]">.</span>
          </h1>
          <p className="text-[13px] max-w-[320px] leading-[1.4] opacity-85 mb-4">
            Surrender the choice. We&rsquo;ll pull a film from your Letterboxd watchlist that fits the night.
          </p>
        </>
      ) : (
        <h1 className="font-display font-black text-[28px] sm:text-[36px] leading-[0.88] tracking-[-0.04em] mb-4">
          TONIGHT<span className="text-[var(--color-accent)]">,</span><br />YOU WATCH
        </h1>
      )}
    </header>
  );
}
