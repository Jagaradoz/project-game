interface ProgressBarProps {
  /** Completed units. */
  value: number;
  /** Total units; a bar with no total has nothing to show. */
  max: number;
  /** Names what is being measured, for a screen reader. */
  label: string;
}

/**
 * A plain percentage bar. Segmented progress (one pip per stage) lives in
 * StageStrip instead -- these two look similar and mean different things.
 */
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

interface StageStripProps {
  /** One entry per stage, in order. */
  stages: readonly { isCleared: boolean; isUnlocked: boolean }[];
  /** Read out in place of the pips, which carry no text of their own. */
  label: string;
}

/** The per-stage pip strip used on /profile to show progress through a biome. */
export function StageStrip({ stages, label }: StageStripProps) {
  return (
    <div className="flex gap-1" role="img" aria-label={label}>
      {stages.map((stage, index) => (
        <span
          key={index}
          className={`h-2 flex-1 border border-ink ${
            stage.isCleared ? 'bg-ok' : stage.isUnlocked ? 'bg-primary/50' : 'bg-off/40'
          }`}
        />
      ))}
    </div>
  );
}
