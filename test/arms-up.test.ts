import { expect, test } from 'vitest';
import { createArmsUpState, updateArmsUp } from '@/engine/detectors/armsUp';
import { LANDMARK } from '@/engine/config';
import type { ArmsUpState } from '@/engine/types';
import { makePose, run, type MakePoseOptions } from './helpers';

const STEP = 40;

function hold(state: ArmsUpState, arms: NonNullable<MakePoseOptions['arms']>, fromMs: number, toMs: number) {
  let s = state;
  let raises = 0;
  for (let t = fromMs; t <= toMs; t += STEP) {
    s = updateArmsUp(s, makePose({ arms }), t);
    raises += Number(s.justRaised);
  }
  return { state: s, raises };
}

test('both arms held overhead emit one raise, then rearm only after lowering', () => {
  let { state, raises } = hold(createArmsUpState(), 'up', 0, 600);
  expect(raises).toBe(1);
  expect(state.raiseCount).toBe(1);
  ({ state } = hold(state, 'down', 640, 1000));
  ({ state, raises } = hold(state, 'up', 1040, 1400));
  expect(raises).toBe(1);
  expect(state.raiseCount).toBe(2);
});

test('a raise is not confirmed until held for confirmMs', () => {
  let s = updateArmsUp(createArmsUpState(), makePose({ arms: 'up' }), 0);
  expect(s.justRaised).toBe(false);
  s = updateArmsUp(s, makePose({ arms: 'up' }), 80);
  expect(s.justRaised).toBe(false);
  s = updateArmsUp(s, makePose({ arms: 'up' }), 160);
  expect(s.justRaised).toBe(true);
});

test('a quick dip that does not stay down long enough does not rearm', () => {
  let { state } = hold(createArmsUpState(), 'up', 0, 400);
  state = updateArmsUp(state, makePose({ arms: 'down' }), 440);
  const { raises } = hold(state, 'up', 480, 900);
  expect(raises).toBe(0);
});

test('one arm raised does not count', () => {
  expect(hold(createArmsUpState(), 'leftUp', 0, 1000).raises).toBe(0);
});

test('arms hanging while jogging never count as a raise', () => {
  const { state } = run(createArmsUpState(), updateArmsUp, 90,
    (i) => makePose({ leftKneeLift: i % 10 < 5 ? 0.3 : 0, rightKneeLift: i % 10 < 5 ? 0 : 0.3 }));
  expect(state.raiseCount).toBe(0);
});

test('hands on hips is not a raise', () => {
  expect(hold(createArmsUpState(), 'hips', 0, 1000).raises).toBe(0);
});

test('missing wrists cancel a pending raise without inventing one', () => {
  let s = updateArmsUp(createArmsUpState(), makePose({ arms: 'up' }), 0);
  const hidden = makePose({ arms: 'up' });
  hidden[LANDMARK.LEFT_WRIST].visibility = 0;
  s = updateArmsUp(s, hidden, 80);
  expect(s.hasArms).toBe(false);
  expect(s.candidateMs).toBeNull();
  s = updateArmsUp(s, makePose({ arms: 'up' }), 160);
  expect(s.justRaised).toBe(false);
  expect(updateArmsUp(createArmsUpState(), null, 0).hasArms).toBe(false);
});
