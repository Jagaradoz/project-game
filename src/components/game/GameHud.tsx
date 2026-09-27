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
          key={snapshot.hp}
          className="flex items-center justify-center gap-1 border border-white/70 bg-black/80 px-2.5 py-1 animate-[pulse_280ms_ease-out_1] motion-reduce:animate-none"
          aria-label={`Health ${snapshot.hp} of ${snapshot.maxHp}`}
        >
          <span className="mr-1 text-[9px] font-bold tracking-[0.14em] text-white/75 uppercase">
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
        <div className="border border-white/70 bg-black/85 px-3 py-2 shadow-[3px_3px_0_0_var(--color-primary)]">
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
    <div className="mx-auto flex w-full max-w-[320px] flex-col gap-1.5 border border-white/70 bg-black/85 px-3 py-2 shadow-[3px_3px_0_0_var(--color-primary)]">
      <div className="flex items-end justify-between gap-3 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        <div className="min-w-0">
          <p className="m-0 text-[9px] font-bold tracking-[0.16em] text-white/65 uppercase">
            Stage objective
          </p>
          <p className="m-0 truncate text-xs font-extrabold tracking-wide uppercase">
            Defeat {snapshot.goalKills} enemies
          </p>
        </div>
        <span className="shrink-0 text-sm font-extrabold tabular-nums">
          {completed}<span className="text-white/55">/{snapshot.goalKills}</span>
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-none bg-white/15 ring-1 ring-black/40"
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
      <span className="text-[9px] font-semibold tracking-wide text-white/65 uppercase">
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
      <span className="text-[10px] font-semibold tracking-[0.1em] text-white/70 uppercase">
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
