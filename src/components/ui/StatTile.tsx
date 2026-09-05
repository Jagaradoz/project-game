interface StatTileProps {
  label: string;
  value: string;
  detail?: string;
  isHighlighted?: boolean;
}

export function StatTile({ label, value, detail, isHighlighted }: StatTileProps) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-surface px-3 py-2.5">
      <span className="text-[11px] tracking-[0.08em] uppercase text-muted">{label}</span>
      <span
        className={`text-2xl leading-[1.1] font-bold tabular-nums ${isHighlighted ? 'text-accent' : ''}`}
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
    <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">{children}</div>
  );
}
