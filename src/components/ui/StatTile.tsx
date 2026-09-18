interface StatTileProps {
  label: string;
  value: string;
  detail?: string;
  /** Decorative glyph in the corner; the label names the number. */
  icon?: React.ReactNode;
  isHighlighted?: boolean;
}

export function StatTile({ label, value, detail, icon, isHighlighted }: StatTileProps) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-elevated px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow text-[11px] tracking-[0.1em]">
          {label}
        </span>
        {icon && <span aria-hidden className="flex flex-none text-accent">{icon}</span>}
      </div>

      <span
        className={`text-3xl leading-[1.1] font-semibold tracking-tight tabular-nums ${
          isHighlighted ? 'text-primary' : 'text-text'
        }`}
      >
        {value}
      </span>

      {detail && <span className="text-xs tabular-nums text-muted">{detail}</span>}
    </div>
  );
}

/** Auto-fitting grid, so a row of tiles reflows instead of overflowing. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">{children}</div>
  );
}
