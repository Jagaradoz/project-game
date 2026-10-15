import { expect, it } from 'vitest';
import { createGameState } from '@/engine/core/state';
import { advanceDemo } from '@/engine/core/demo';
import { CONFIG } from '@/engine/config';

it('demonstrates all controls without enemies, scrolling, damage or scoring', () => {
  let state = advanceDemo(createGameState(), { lane: 0, isFiring: true, cadenceSpm: 60, stepEvents: 1, isShielding: true, jump: true }, 30);
  expect(state.lane).toBe(0);
  expect(state.bullets).toHaveLength(1);
  expect(state.isShielding).toBe(true);
  expect(state.jumpStartedMs).not.toBeNull();
  for (let i = 0; i < 1000; i++) state = advanceDemo(state, { lane: 2, isFiring: false, cadenceSpm: 0, stepEvents: 0 }, 33);
  expect(state.speed).toBe(0);
  expect(state.jumpStartedMs).toBeNull();
  expect(state.bullets).toHaveLength(0);
  expect(state.enemies).toHaveLength(0);
  expect(state.obstacles).toHaveLength(0);
  expect(state.score).toBe(0);
  expect(state.hp).toBe(CONFIG.game.maxHp);
  expect(state.distance).toBe(0);
  expect(state.isOver).toBe(false);
});
