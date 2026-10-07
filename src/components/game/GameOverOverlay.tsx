import { ChartColumn, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import type { HudSnapshot } from '@/engine/runtime';
import { formatNumber } from '@/lib/format';

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
  if (!snapshot.isOver || !snapshot.endPresentationComplete) return null;

  return (
    <div className="absolute inset-0 z-[3] grid content-end justify-items-stretch bg-black/75 p-4 pb-8 text-left sm:content-center sm:justify-items-center sm:text-center">
      <div className="flex max-w-sm flex-col gap-3 border-2 border-ink bg-surface p-6 shadow-[7px_7px_0_0_var(--color-primary)] sm:items-center">
        <span className="eyebrow">{snapshot.isCleared ? 'Cleared' : 'Complete'}</span>

        <h2 className="m-0 text-3xl font-black tracking-tight sm:text-4xl">
          {snapshot.isCleared ? 'Training cleared' : snapshot.deathReason === 'drowned' ? 'River crossing missed' : snapshot.deathReason === 'poisoned' ? 'Overcome by spores' : 'Run complete'}
        </h2>

        <p className="m-0 text-sm tabular-nums text-muted">
          {formatNumber(snapshot.score)} points &middot; {Math.round(snapshot.distance)} m
          {snapshot.goalKills !== null && (
            <> &middot; {snapshot.killCount}/{snapshot.goalKills} defeated</>
          )}
        </p>

        {snapshot.deathReason === 'drowned' && (
          <p className="m-0 max-w-xs text-sm leading-relaxed text-muted">
            Jump across the river to stay safe. You can try again straight away.
          </p>
        )}
        {snapshot.deathReason === 'poisoned' && (
          <p className="m-0 max-w-xs text-sm leading-relaxed text-muted">
            Put your hands on your hips to raise the shield inside the spore cloud. You can try
            again straight away.
          </p>
        )}
        {snapshot.deathReason === 'damage' && (
          <p className="m-0 max-w-xs text-sm leading-relaxed text-muted">
            You ran out of health. Take a breath and go again whenever you are ready.
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
