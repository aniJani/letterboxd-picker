"use client";

export type PickButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
};

export function PickButton({ onClick, disabled, children }: PickButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="block w-full mt-6 py-[18px] bg-[var(--color-ink)] text-[var(--color-paper)] font-display font-black text-[22px] tracking-[0.2em] uppercase border-0 cursor-pointer transition-transform"
      style={{
        boxShadow: disabled ? "none" : "6px 6px 0 var(--color-accent)",
        opacity: disabled ? 0.4 : 1,
        transform: "translate(0, 0)",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.transform = "translate(-2px, -2px)"; e.currentTarget.style.boxShadow = "8px 8px 0 var(--color-accent)"; } }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translate(0, 0)"; e.currentTarget.style.boxShadow = disabled ? "none" : "6px 6px 0 var(--color-accent)"; }}
    >
      {children ?? <>PICK MY FILM <span style={{ color: "var(--color-accent)" }}>▸</span></>}
    </button>
  );
}
