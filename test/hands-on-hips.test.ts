import { expect, test } from 'vitest';
import { createHandsOnHipsState, updateHandsOnHips } from '@/engine/detectors/handsOnHips';
import { LANDMARK } from '@/engine/config';
import type { HandsOnHipsState } from '@/engine/types';
import { makePose, type MakePoseOptions } from './helpers';

const STEP = 40;

function hold(state: HandsOnHipsState, opts: MakePoseOptions, fromMs: number, toMs: number) {
  let s = state;
  for (let t = fromMs; t <= toMs; t += STEP) s = updateHandsOnHips(s, makePose(opts), t);
  return s;
}

test('hands on hips raises the shield after enterMs and keeps it while held', () => {
  let s = hold(createHandsOnHipsState(), { arms: 'hips' }, 0, 200);
  expect(s.isActive).toBe(false);
  s = hold(s, { arms: 'hips' }, 240, 3000);
  expect(s.isActive).toBe(true);
  expect(s.holdCount).toBe(1);
});

test('the shield drops only after the pose is broken for exitMs', () => {
  let s = hold(createHandsOnHipsState(), { arms: 'hips' }, 0, 600);
  s = updateHandsOnHips(s, makePose({ arms: 'down' }), 640);
  expect(s.isActive).toBe(true);
  s = hold(s, { arms: 'hips' }, 680, 800);
  expect(s.isActive).toBe(true);
  s = hold(s, { arms: 'down' }, 840, 1200);
  expect(s.isActive).toBe(false);
  s = hold(s, { arms: 'hips' }, 1240, 1800);
  expect(s.holdCount).toBe(2);
});

test('arms hanging loose, raised overhead or one-sided never raise the shield', () => {
  for (const arms of ['down', 'up', 'leftUp'] as const) {
    expect(hold(createHandsOnHipsState(), { arms }, 0, 1500).isActive).toBe(false);
  }
  const oneSide = (t: number) => {
    const p = makePose({ arms: 'hips' });
    const down = makePose({ arms: 'down' });
    p[LANDMARK.RIGHT_ELBOW] = down[LANDMARK.RIGHT_ELBOW];
    p[LANDMARK.RIGHT_WRIST] = down[LANDMARK.RIGHT_WRIST];
    return updateHandsOnHips(createHandsOnHipsState(), p, t);
  };
  expect(oneSide(0).isActive).toBe(false);
});

test('jogging with arms loose does not raise the shield', () => {
  let s = createHandsOnHipsState();
  for (let t = 0; t <= 3000; t += STEP) {
    const up = Math.floor(t / 200) % 2 === 0;
    s = updateHandsOnHips(s, makePose({ leftKneeLift: up ? 0.3 : 0, rightKneeLift: up ? 0 : 0.3 }), t);
  }
  expect(s.holdCount).toBe(0);
});

test('hands covering the hips reuse the last seen hips within occlusionHoldMs', () => {
  let s = hold(createHandsOnHipsState(), { arms: 'down' }, 0, 200);
  s = hold(s, { arms: 'hips', hipVisibility: 0 }, 240, 1000);
  expect(s.isActive).toBe(true);
  // Long after the hips were last seen, the stale positions are dropped.
  s = hold(s, { arms: 'hips', hipVisibility: 0 }, 1040, 2400);
  expect(s.isActive).toBe(false);
});

test('no pose at all reads as no arms and lets the shield drop', () => {
  let s = hold(createHandsOnHipsState(), { arms: 'hips' }, 0, 600);
  s = updateHandsOnHips(s, null, 640);
  expect(s.hasArms).toBe(false);
  s = updateHandsOnHips(s, null, 1000);
  expect(s.isActive).toBe(false);
});
