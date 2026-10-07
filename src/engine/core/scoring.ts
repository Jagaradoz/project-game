/**
 * Score rules, as pure functions over one reducer step's events.
 *
 * Kept apart from the reducer so the formula lives in one place: the server is
 * told to re-derive a submitted score (src/types/api.ts), and it can only do
 * that if the rules are small enough to port. Every input here is something the
 * reducer already knows; nothing reads the clock or the scene.
 *
 *   kill      config.scoring.kill[kind] x the combo multiplier at that kill,
 *             paid out as score orbs dropped where the enemy fell -- the points
 *             count only when the player walks through them (see core/orbs.ts)
 *   distance  `perMetre` for every whole metre walked
 *   hazard    `hazardCleared` for each log, rockfall or river crossed safely
 *   goal      `stageCleared` once, on the step a goal run is cleared
 *
 * The combo counts kills that land within `comboWindowMs` of the previous one.
 * Taking damage breaks it, after this step's kills are valued.
 */

import type { KillMark, RunConfig } from '@/engine/types';

export interface ComboChain {
  /** Kills in the current chain. 0 when no chain is running. */
  combo: number;
  /** When the chain's latest kill landed. */
  lastKillMs: number;
}

export interface StepPoints {
  fromDistance: number;
  toDistance: number;
  hazardsCleared: number;
  justCleared: boolean;
  /** Points carried by the orbs picked up this step. */
  collected: number;
}

/** Multiplier for the `combo`-th kill in a chain: one step up every `comboStep` kills, capped. */
export function comboMultiplier(combo: number, config: RunConfig): number {
  const { comboStep, multiplierStep, maxMultiplier } = config.scoring;
  const steps = Math.floor(Math.max(0, combo - 1) / comboStep);
  return Math.min(maxMultiplier, 1 + steps * multiplierStep);
}

/** The multiplier the next kill would earn, or 1 once the chain has lapsed. For the HUD. */
export function activeMultiplier(chain: ComboChain, elapsedMs: number, config: RunConfig): number {
  if (chain.combo === 0 || elapsedMs - chain.lastKillMs > config.scoring.comboWindowMs) return 1;
  return comboMultiplier(chain.combo + 1, config);
}

export function killPoints(kill: KillMark, multiplier: number, config: RunConfig): number {
  return Math.round(config.scoring.kill[kill.kind ?? 'normal'] * multiplier);
}

/** Whole metres only, so the total never depends on how the run was sliced into frames. */
export function distancePoints(fromDistance: number, toDistance: number, config: RunConfig): number {
  return (Math.floor(toDistance) - Math.floor(fromDistance)) * config.scoring.perMetre;
}

/**
 * Values this step's kills in order, extending or restarting the chain.
 * Returns one value per kill, so each can be dropped as its own orbs.
 */
export function chainKills(
  chain: ComboChain,
  kills: KillMark[],
  tookDamage: boolean,
  elapsedMs: number,
  config: RunConfig,
): { chain: ComboChain; values: number[] } {
  const isLive = chain.combo > 0 && elapsedMs - chain.lastKillMs <= config.scoring.comboWindowMs;
  let combo = isLive ? chain.combo : 0;
  const values = kills.map((kill) => {
    combo += 1;
    return killPoints(kill, comboMultiplier(combo, config), config);
  });

  return {
    chain: {
      combo: tookDamage ? 0 : combo,
      lastKillMs: kills.length > 0 ? elapsedMs : chain.lastKillMs,
    },
    values,
  };
}

/** Everything a step adds to the score. Kills pay only through `collected`. */
export function stepPoints(events: StepPoints, config: RunConfig): number {
  return distancePoints(events.fromDistance, events.toDistance, config)
    + events.hazardsCleared * config.scoring.hazardCleared
    + (events.justCleared ? config.scoring.stageCleared : 0)
    + events.collected;
}
