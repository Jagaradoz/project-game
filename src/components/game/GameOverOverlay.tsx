import { ChartColumn, RotateCcw, Trophy } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import type { HudSnapshot } from '@/engine/runtime';

interface GameOverOverlayProps {
  snapshot: HudSnapshot;
  onRestart: () => void;
  /** Shown alongside Restart once the run has been recorded. */
  onSeeResult?: () => void;
  isSubmitting?: boolean;
}

/**
 * Ends the run. A cleared stage and a failed one look different on purpose --
 * TOR 5.1 asks for non-punitive design, so a loss is stated plainly and without
 * penalty language, and a clear is celebrated.
 */
export function GameOverOverlay({
  snapshot,
  onRestart,
  onSeeResult,
  isSubmitting,
}: GameOverOverlayProps) {
  if (!snapshot.isOver) return null;

  return (
    <div className="absolute inset-0 z-[3] grid content-center justify-items-center gap-3 bg-[rgba(15,20,26,0.9)] p-6 text-center backdrop-blur-sm">
      <span
        aria-hidden
        className={`grid size-14 place-items-center rounded-full ${
          snapshot.isCleared ? 'bg-ok-soft text-ok' : 'bg-elevated text-muted'
        }`}
      >
        {snapshot.isCleared ? <Trophy size={26} /> : <RotateCcw size={26} />}
      </span>

      <h2 className="m-0 text-3xl font-bold">
        {snapshot.isCleared ? 'Stage cleared' : 'Run complete'}
      </h2>

      <p className="m-0 tabular-nums text-muted">
        {snapshot.score} points &middot; {Math.round(snapshot.distance)} m
        {snapshot.goalKills !== null && (
          <> &middot; {snapshot.killCount}/{snapshot.goalKills} defeated</>
        )}
      </p>

      {!snapshot.isCleared && snapshot.goalKills !== null && (
        <p className="m-0 max-w-xs text-sm leading-relaxed text-muted">
          You did not reach this stage&rsquo;s target. Go again straight away, or pick a difficulty
          that suits you better.
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <Button onClick={onRestart} icon={<RotateCcw size={18} />} className="min-w-[160px]">
          Play again
        </Button>

        {onSeeResult && (
          <Button
            variant="secondary"
            onClick={onSeeResult}
            isLoading={isSubmitting}
            icon={<ChartColumn size={18} />}
            className="min-w-[160px]"
          >
            {isSubmitting ? 'Saving…' : 'See summary'}
          </Button>
        )}
      </div>
    </div>
  );
}
