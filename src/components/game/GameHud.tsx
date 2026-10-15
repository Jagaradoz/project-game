import { Heart, Shield } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import type { HudSnapshot } from '@/engine/runtime';
import { useCountUp } from '@/hooks/useCountUp';
import { formatNumber, formatDuration } from '@/lib/format';
import { CONFIG } from '@/engine/config';
import pkg from '../../../package.json';

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
      <p
        className="pointer-events-none absolute top-3 right-3 z-[1] m-0 bg-ink/85 px-2 py-1 font-mono text-[10px] leading-none text-white/80 tabular-nums"
        aria-label={`Development version ${pkg.version}`}
      >
        v{pkg.version}
      </p>
      <div className="pointer-events-none absolute inset-x-3 top-24 z-[1] flex flex-col items-center gap-2">
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
            <Stat label="Speed" value={`${snapshot.speed.toFixed(1)} m/s`} />
            <Stat label="Difficulty" value={`${snapshot.difficulty} / 5`} />
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
  const hp = snapshot.bossHp ?? snapshot.enemyHp;
  const maxHp = snapshot.bossHp !== null ? snapshot.bossMaxHp : snapshot.enemyMaxHp;
  if (hp === null || maxHp === null) return null;
  const title = snapshot.bossHp !== null ? 'Elder Treant' : 'Nearest enemy';
  return (
    <div className="w-full max-w-[320px] border-2 border-surface bg-ink px-3 py-2 text-white">
      <div className="flex justify-between text-xs font-black uppercase"><span>{title}</span><span>{hp}/{maxHp}</span></div>
      <progress className="mt-1 h-2 w-full accent-orange-500" max={maxHp} value={hp} aria-label={`${title} health`} />
    </div>
  );
}

/**
 * Training goal progress. Absent in an endless run, which has no goal.
 */
function GoalBar({ snapshot }: { snapshot: HudSnapshot }) {
  return <div className="mx-auto flex w-full max-w-[320px] flex-col gap-2 border-2 border-surface bg-ink px-3 py-2 text-white shadow-[4px_4px_0_0_var(--color-primary)]">
    <div className="flex justify-between text-sm font-bold"><span>{snapshot.goalReached ? '20-minute goal reached' : '20-minute goal'}</span><span className="tabular-nums">{formatDuration(snapshot.elapsedMs)}</span></div>
    <progress className="h-3 w-full accent-orange-500" value={Math.min(snapshot.elapsedMs, CONFIG.game.goalMs)} max={CONFIG.game.goalMs} aria-label="Progress toward 20 minutes of gameplay" />
    {snapshot.goalReached && <p className="m-0 text-xs">Keep playing or finish whenever you are ready.</p>}
  </div>;
}

function ScoreStat({ score, shownScore }: { score: number; shownScore: number }) {
  return <div className="flex items-baseline gap-2"><span className="text-[11px] font-bold tracking-wide text-white/80 uppercase">Score</span>
    <span key={score} className="text-base font-black tabular-nums text-primary">{formatNumber(shownScore)}</span></div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline gap-2"><span className="text-[11px] font-bold tracking-wide text-white/80 uppercase">{label}</span><span className="text-base tabular-nums">{value}</span></div>;
}
