import { Heart } from 'lucide-react';
import type { HudSnapshot } from '@/engine/runtime';

interface GameHudProps {
  snapshot: HudSnapshot;
}

/**
 * Score, distance, health and stage progress, over the canvas.
 * The gradient behind it is not decoration -- the sky is bright,
 * so the HUD needs its own ground to sit on.
 */
export function GameHud({ snapshot }: GameHudProps) {
  const pips = Array.from({ length: snapshot.maxHp }, (_, index) => index < snapshot.hp);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[1] flex flex-col items-center gap-2">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-3 -top-3 -bottom-6 -z-10 bg-linear-to-b from-[rgba(10,12,15,0.65)] to-transparent"
        />

        <GoalBar snapshot={snapshot} />

        <div
          className="flex items-center justify-center gap-1"
          aria-label={`Health ${snapshot.hp} of ${snapshot.maxHp}`}
        >
          {pips.map((isFull, index) => (
            <Heart
              key={index}
              size={16}
              aria-hidden
              className={`transition-colors duration-200 ${
                isFull
                  ? 'fill-enemy text-enemy drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]'
                  : 'fill-black/35 text-white/30 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[1]">
        <div className="rounded-md bg-[rgba(10,12,15,0.62)] px-3 py-2 ring-1 ring-white/10 backdrop-blur-[2px]">
          <div className="flex flex-col gap-0.5 font-semibold tabular-nums text-white">
            <Stat label="Score" value={String(snapshot.score)} />
            <Stat label="Distance" value={`${Math.round(snapshot.distance)} m`} />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The enemy health bar TOR 3 asks for at the top centre of the screen, drained
 * by progress towards the stage goal.
 *
 * It reads as the opposition's health -- it starts full and empties as enemies
 * die -- which is what the requirement is after: the player should see the
 * effect of their attacks clearly. There is no distinct boss entity in the
 * engine yet; when one lands, this is the bar it drives.
 *
 * Absent entirely in an endless run, which has no goal to show.
 */
function GoalBar({ snapshot }: { snapshot: HudSnapshot }) {
  if (snapshot.goalKills === null) return null;

  const remaining = Math.max(0, snapshot.goalKills - snapshot.killCount);
  const remainingShare = (remaining / snapshot.goalKills) * 100;

  return (
    <div className="mx-auto flex w-full max-w-[280px] flex-col gap-1 pt-1">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[rgba(10,12,15,0.7)] ring-1 ring-white/15"
        role="progressbar"
        aria-label="Enemy health remaining in this stage"
        aria-valuemin={0}
        aria-valuemax={snapshot.goalKills}
        aria-valuenow={remaining}
      >
        <div
          className="h-full rounded-full bg-enemy transition-[width] duration-200"
          style={{ width: `${remainingShare}%` }}
        />
      </div>

      <span className="text-center text-[10px] font-semibold tracking-wide tabular-nums text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        {snapshot.killCount} / {snapshot.goalKills}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-semibold tracking-[0.1em] text-white/70 uppercase">
        {label}
      </span>
      <span className="text-base leading-tight tracking-tight">{value}</span>
    </div>
  );
}
