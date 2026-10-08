import { Heart, Shield } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import type { HudSnapshot } from '@/engine/runtime';
import { useCountUp } from '@/hooks/useCountUp';
import { formatNumber } from '@/lib/format';

interface GameHudProps {
  snapshot: HudSnapshot;
}

/** Each five-hit milestone moves to the next vivid colour family. */
const HIT_PALETTES = [
  ['#fff36a', '#ff941f'],
  ['#8dff8a', '#18eaca'],
  ['#86f4ff', '#369dff'],
  ['#ffb1f7', '#fa47c7'],
  ['#d6b4ff', '#a36cff'],
  ['#ffd59a', '#ff654d'],
] as const;

/**
 * Score, distance, health and stage progress, over the canvas.
 * Solid ink panels keep the objective legible against every biome's sky.
 */
export function GameHud({ snapshot }: GameHudProps) {
  const pips = Array.from({ length: snapshot.maxHp }, (_, index) => index < snapshot.hp);
  const shownScore = useCountUp(snapshot.score);

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
          {snapshot.isShielding && (
            <Shield size={16} aria-label="Shield up" className="ml-1 fill-sky-300/40 text-sky-300 order-last" />
          )}
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
        <BossBar snapshot={snapshot} />
      </div>

      <ComboHit hits={snapshot.comboHits} />

      <div className="pointer-events-none absolute bottom-3 left-3 z-[1]">
        <div className="border-2 border-surface bg-ink px-3 py-2 shadow-[4px_4px_0_0_var(--color-primary)]">
          <div className="flex flex-col gap-0.5 font-semibold tabular-nums text-white">
            <ScoreStat score={snapshot.score} shownScore={shownScore} />
            {snapshot.comboMultiplier > 1 && (
              <span
                key={snapshot.comboMultiplier}
                className="self-start border border-primary px-1.5 text-xs font-black text-primary animate-[pulse_300ms_ease-out_1] motion-reduce:animate-none"
                aria-label={`Combo multiplier ${snapshot.comboMultiplier} times`}
              >
                Combo ×{snapshot.comboMultiplier}
              </span>
            )}
            <Stat label="Distance" value={`${Math.round(snapshot.distance)} m`} />
          </div>
        </div>
      </div>
    </>
  );
}

function ComboHit({ hits }: { hits: number }) {
  // Retain the last positive number while the wrapper fades out. The wrapper
  // stays mounted so a new hit smoothly reverses an interrupted fade.
  const [lastHits, setLastHits] = useState(hits);
  if (hits > 0 && hits !== lastHits) setLastHits(hits);
  const shownHits = hits > 0 ? hits : lastHits;
  const palette = HIT_PALETTES[Math.floor(shownHits / 5) % HIT_PALETTES.length]!;
  const milestone = shownHits > 0 && shownHits % 5 === 0;
  const style = {
    '--combo-light': palette[0],
    '--combo-color': palette[1],
  } as CSSProperties;

  return (
    <div
      className="combo-hit pointer-events-none absolute top-[32%] left-[5%] z-[1]"
      style={style}
      aria-label={`Combo Hit: ${shownHits} successful hits`}
      aria-hidden={hits === 0}
      data-active={hits > 0}
      data-combo-hits={hits}
    >
      {shownHits > 0 && <div key={shownHits} className={`combo-hit-pulse ${milestone ? 'combo-hit-milestone' : ''}`}>
        <span className="combo-hit-label">Combo Hit</span>
        <span className="combo-hit-number">{shownHits}</span>
        {milestone && <span aria-hidden className="combo-hit-spark">✦</span>}
      </div>}
    </div>
  );
}

/** The Elder Treant's health, under the player's own while the boss is up. */
function BossBar({ snapshot }: { snapshot: HudSnapshot }) {
  if (snapshot.bossHp === null) return null;
  return (
    <div className="w-full max-w-[320px] border-2 border-surface bg-ink px-3 py-2 text-white">
      <div className="flex justify-between text-xs font-black uppercase"><span>Elder Treant</span><span>{snapshot.bossHp}/{snapshot.bossMaxHp}</span></div>
      <progress className="mt-1 h-2 w-full accent-orange-500" max={snapshot.bossMaxHp} value={snapshot.bossHp} aria-label="Elder Treant health" />
    </div>
  );
}

/**
 * Training goal progress. Absent in an endless run, which has no goal.
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
            Training goal
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
        aria-label="Enemies defeated"
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
        {snapshot.isCleared ? 'Objective complete' : remaining === 0 ? 'Defeat the Elder Treant to finish' : `${remaining} remaining · includes the boss`}
      </span>
    </div>
  );
}

/**
 * The score only moves when orbs land, so every change is a pickup: the number
 * swells. The "+N" for each orb floats up in the world, beside the character.
 */
function ScoreStat({ score, shownScore }: { score: number; shownScore: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] font-bold tracking-[0.08em] text-white/80 uppercase">Score</span>
      <span
        key={score}
        className="inline-block origin-left text-base leading-tight tracking-tight text-primary animate-[score-bump_260ms_ease-out_1] motion-reduce:animate-none"
      >
        {formatNumber(shownScore)}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] font-bold tracking-[0.08em] text-white/80 uppercase">
        {label}
      </span>
      <span className="text-base leading-tight tracking-tight">{value}</span>
    </div>
  );
}
