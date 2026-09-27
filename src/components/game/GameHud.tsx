import { Heart } from 'lucide-react';
import type { HudSnapshot } from '@/engine/runtime';

interface GameHudProps {
  snapshot: HudSnapshot;
}

/**
 * Score, distance, health and stage progress, over the canvas.
 * Solid ink panels keep the objective legible against every biome's sky.
 */
export function GameHud({ snapshot }: GameHudProps) {
  const pips = Array.from({ length: snapshot.maxHp }, (_, index) => index < snapshot.hp);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[1] flex flex-col items-center gap-2">
        <GoalBar snapshot={snapshot} />

        <div
          key={snapshot.hp}
          className="flex items-center justify-center gap-1 border-2 border-surface bg-ink px-3 py-1 shadow-[3px_3px_0_0_var(--color-primary)] animate-[pulse_280ms_ease-out_1] motion-reduce:animate-none"
          aria-label={`Health ${snapshot.hp} of ${snapshot.maxHp}`}
        >
          <span className="mr-1 text-[10px] font-black tracking-[0.12em] text-white uppercase">
            Health
          </span>
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
        <div className="border-2 border-surface bg-ink px-3 py-2 shadow-[4px_4px_0_0_var(--color-primary)]">
          <div className="flex flex-col gap-0.5 font-semibold tabular-nums text-white">
            <Stat label="Score" value={String(snapshot.score)} reactiveKey={snapshot.score} accent />
            <Stat label="Distance" value={`${Math.round(snapshot.distance)} m`} />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Stage objective progress. Absent in an endless run, which has no goal.
 */
function GoalBar({ snapshot }: { snapshot: HudSnapshot }) {
  if (snapshot.goalKills === null) return null;

  const completed = Math.min(snapshot.killCount, snapshot.goalKills);
  const completedShare = (completed / snapshot.goalKills) * 100;
  const remaining = Math.max(0, snapshot.goalKills - completed);

  return (
    <div className="mx-auto flex w-full max-w-[320px] flex-col gap-1.5 border-2 border-surface bg-ink px-3 py-2 shadow-[4px_4px_0_0_var(--color-primary)]">
      <div className="flex items-end justify-between gap-3 text-white">
        <div className="min-w-0">
          <p className="m-0 text-[10px] font-black tracking-[0.12em] text-white/80 uppercase">
            Stage objective
          </p>
          <p className="m-0 truncate text-sm font-black tracking-wide uppercase">
            Defeat {snapshot.goalKills} enemies
          </p>
        </div>
        <span className="shrink-0 text-base font-black tabular-nums">
          {completed}<span className="text-white/55">/{snapshot.goalKills}</span>
        </span>
      </div>
      <div
        className="h-3 overflow-hidden border border-white/50 bg-white/15"
        role="progressbar"
        aria-label="Stage enemies defeated"
        aria-valuemin={0}
        aria-valuemax={snapshot.goalKills}
        aria-valuenow={completed}
      >
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${completedShare}%` }}
        />
      </div>
      <span className="text-[10px] font-bold tracking-wide text-white/80 uppercase">
        {remaining === 0 ? 'Objective complete' : `${remaining} remaining`}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  reactiveKey,
  accent = false,
}: {
  label: string;
  value: string;
  reactiveKey?: number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] font-bold tracking-[0.08em] text-white/80 uppercase">
        {label}
      </span>
      <span
        key={reactiveKey}
        className={`text-base leading-tight tracking-tight ${
          accent
            ? 'text-primary animate-[pulse_300ms_ease-out_1] motion-reduce:animate-none'
            : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
