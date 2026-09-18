import { ChartColumn, RotateCcw } from 'lucide-react';

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
    <div className="absolute inset-0 z-[3] grid content-end justify-items-stretch bg-[rgba(10,12,15,0.78)] p-6 pb-8 text-left backdrop-blur-[2px] sm:content-center sm:justify-items-center sm:text-center">
      <div className="flex max-w-sm flex-col gap-3 sm:items-center">
        <span className="eyebrow">{snapshot.isCleared ? 'Cleared' : 'Complete'}</span>

        <h2 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">
          {snapshot.isCleared ? 'Stage cleared' : 'Run complete'}
        </h2>

        <p className="m-0 text-sm tabular-nums text-muted">
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

        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
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
    </div>
  );
}
