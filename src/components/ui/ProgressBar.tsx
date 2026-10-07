interface ProgressBarProps {
  /** Completed units. */
  value: number;
  /** Total units; a bar with no total has nothing to show. */
  max: number;
  /** Names what is being measured, for a screen reader. */
  label: string;
}

/** A plain percentage bar. */
export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const share = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-3 w-full overflow-hidden rounded-none border border-ink bg-elevated"
    >
      <div
        className="h-full bg-primary transition-[width] duration-300"
        style={{ width: `${share}%` }}
      />
    </div>
  );
}
