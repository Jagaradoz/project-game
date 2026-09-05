import type { HudSnapshot } from '@/engine/runtime';

interface GameHudProps {
  snapshot: HudSnapshot;
}

/**
 * Score, distance and health, over the canvas. The gradient behind it is not
 * decoration -- the sky is bright, so the HUD needs its own ground to sit on.
 */
export function GameHud({ snapshot }: GameHudProps) {
  const pips = Array.from({ length: snapshot.maxHp }, (_, index) => index < snapshot.hp);

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-[1] flex flex-col gap-2.5">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-3 -top-3 -bottom-6 -z-10 bg-linear-to-b from-[rgba(9,14,20,0.6)] to-transparent"
      />

      <div className="flex gap-1.5" aria-label={`Health ${snapshot.hp} of ${snapshot.maxHp}`}>
        {pips.map((isFull, index) => (
          <span
            key={index}
            className={`h-2.5 w-6 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.7)] ${
              isFull ? 'bg-enemy' : 'bg-off/50'
            }`}
          />
        ))}
      </div>

      <div className="flex gap-4 font-display font-bold tabular-nums text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_0_12px_rgba(0,0,0,0.5)]">
        <Stat label="Score" value={String(snapshot.score)} />
        <Stat label="Dist" value={`${Math.round(snapshot.distance)} m`} />
      </div>

      <GoalBar snapshot={snapshot} />
    </div>
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
    <div className="mx-auto flex w-full max-w-[340px] flex-col gap-1 pt-1">
      <div
        className="h-2.5 overflow-hidden rounded-full bg-[rgba(9,14,20,0.7)] ring-1 ring-white/20"
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

      <span className="text-center text-[11px] font-semibold tabular-nums text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        {snapshot.killCount} / {snapshot.goalKills}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[11px] font-semibold tracking-[0.08em] text-white/80 uppercase">
        {label}
      </span>
      <span className="text-lg">{value}</span>
    </span>
  );
}
