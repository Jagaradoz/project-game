import { describe, expect, it } from 'vitest';
import { CONFIG, LANDMARK } from '@/engine/config';
import { createClapState, updateClap } from '@/engine/detectors/clap';
import { createInput } from '@/engine/core/input';
import { createGameState, updateGame, difficultyAt } from '@/engine/core/state';
import { makePose } from './helpers';

function clapPose(closed: boolean) {
  const pose = makePose({ arms: 'up' });
  if (closed) {
    pose[LANDMARK.LEFT_WRIST]!.x = 0.51;
    pose[LANDMARK.RIGHT_WRIST]!.x = 0.49;
  }
  return pose;
}

describe('Proposal controls', () => {
  it('requires separation then an overhead clap, never an arm raise alone', () => {
    let state = createClapState();
    for (let t = 0; t < 500; t += 33) state = updateClap(state, clapPose(false), t);
    expect(state.clapCount).toBe(0);
    for (let t = 500; t < 700; t += 33) state = updateClap(state, clapPose(true), t);
    expect(state.clapCount).toBe(1);
    for (let t = 700; t < 1200; t += 33) state = updateClap(state, clapPose(true), t);
    expect(state.clapCount).toBe(1);
    for (let t = 1200; t < 1500; t += 33) state = updateClap(state, clapPose(false), t);
    for (let t = 1500; t < 1700; t += 33) state = updateClap(state, clapPose(true), t);
    expect(state.clapCount).toBe(2);
  });
  it('rejects missing wrists and claps below the head', () => {
    let state = updateClap(createClapState(), clapPose(false), 0);
    state = updateClap(state, clapPose(false), 300);
    const low = clapPose(true);
    low[LANDMARK.LEFT_WRIST]!.y = low[LANDMARK.RIGHT_WRIST]!.y = 0.45;
    state = updateClap(state, low, 400);
    state = updateClap(state, low, 600);
    expect(state.clapCount).toBe(0);
    const missing = clapPose(true);
    missing[LANDMARK.LEFT_WRIST]!.visibility = 0;
    expect(updateClap(state, missing, 700).justClapped).toBe(false);
  });
  it('consumes every step once even across repeated inference and render frames', () => {
    const input = createInput();
    input.setPose('CENTER', true, false, 90, 2);
    const first = input.read();
    expect(first.stepEvents).toBe(2);
    expect(input.read().stepEvents).toBe(0);
    input.setPose('CENTER', true, false, 90, 2);
    expect(input.read().stepEvents).toBe(0);
    input.setPose('CENTER', true, false, 90, 3);
    expect(input.read().stepEvents).toBe(1);
    input.clearPose();
    expect(input.read().cadenceSpm).toBe(0);
  });
  it('a knee step fires nothing while the shield is up or during a jump', () => {
    const shielded = updateGame(createGameState(), { lane: 1, isFiring: true, isShielding: true, cadenceSpm: 90, stepEvents: 1 }, 33);
    expect(shielded.justFired).toBe(false);
    const jumping = updateGame(createGameState(), { lane: 1, isFiring: true, jump: true, cadenceSpm: 90, stepEvents: 1 }, 33);
    expect(jumping.justFired).toBe(false);
  });
  it('fires one identical projectile per step without a continuous-fire tail', () => {
    let state = createGameState();
    state = updateGame(state, { lane: 1, isFiring: true, cadenceSpm: 90, stepEvents: 2 }, 33);
    expect(state.bullets).toHaveLength(2);
    state = updateGame(state, { lane: 1, isFiring: true, cadenceSpm: 90, stepEvents: 0 }, 33);
    expect(state.bullets).toHaveLength(2);
    expect(state.justFired).toBe(false);
  });
  it('scales speed with cadence and stops without coasting', () => {
    const slow = updateGame(createGameState(), { lane: 1, isFiring: false, cadenceSpm: 60, stepEvents: 0 }, 100);
    const fast = updateGame(createGameState(), { lane: 1, isFiring: false, cadenceSpm: 120, stepEvents: 0 }, 100);
    expect(fast.speed).toBeGreaterThan(slow.speed);
    const stopped = updateGame(fast, { lane: 1, isFiring: false, cadenceSpm: 0, stepEvents: 0 }, 33);
    expect(stopped.speed).toBe(0);
    expect(stopped.distance).toBe(fast.distance);
  });
  it('advances difficulty every four gameplay minutes and does not end at the goal', () => {
    expect(difficultyAt(0, 1)).toBe(1);
    expect(difficultyAt(240000, 1)).toBe(2);
    expect(difficultyAt(240000, 3)).toBe(4);
    expect(difficultyAt(1200000, 1)).toBe(5);
    const state = { ...createGameState(), elapsedMs: CONFIG.game.goalMs, invulnUntilMs: Infinity };
    const next = updateGame(state, { lane: 1, isFiring: false, cadenceSpm: 0, stepEvents: 0 }, 33);
    expect(next.isOver).toBe(false);
    expect(next.elapsedMs).toBeGreaterThan(CONFIG.game.goalMs);
  });
  it('counts actual active time independently of the physics clamp and rewards movement', () => {
    let state = createGameState();
    for (let i = 0; i < 10; i++) state = updateGame(state, { lane: 1, isFiring: false, cadenceSpm: 60, stepEvents: 0, startingDifficulty: 1 }, 100);
    expect(state.elapsedMs).toBe(1000);
    expect(state.movementMs).toBe(1000);
    expect(state.score).toBe(CONFIG.game.movementPointsPerSecond);
    const stopped = updateGame(state, { lane: 1, isFiring: false, cadenceSpm: 0, stepEvents: 0, startingDifficulty: 1 }, 100);
    expect(stopped.movementMs).toBe(1000);
    expect(stopped.score).toBe(state.score);
  });
});
