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
    <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-[1] flex flex-col gap-2">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-3 -top-3 -bottom-5 -z-10 bg-linear-to-b from-[rgba(9,18,24,0.55)] to-transparent"
      />

      <div className="flex gap-1.5" aria-label={`Health ${snapshot.hp} of ${snapshot.maxHp}`}>
        {pips.map((isFull, index) => (
          <span
            key={index}
            className={`h-2.5 w-[22px] rounded-[3px] shadow-[0_1px_3px_rgba(0,0,0,0.7)] ${
              isFull ? 'bg-enemy' : 'bg-off opacity-50'
            }`}
          />
        ))}
      </div>

      <div className="flex gap-3.5 font-bold tabular-nums text-[#f7fbff] [text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_0_12px_rgba(0,0,0,0.5)]">
        <Stat label="Score" value={String(snapshot.score)} />
        <Stat label="Dist" value={`${Math.round(snapshot.distance)} m`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#cfe0ec]">
        {label}
      </span>
      <span>{value}</span>
    </span>
  );
}
