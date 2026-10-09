import { test } from 'vitest';
import assert from 'node:assert/strict';

import { CONFIG, LANDMARK } from '@/engine/config';
import { createJogState, updateJog } from '@/engine/detectors/jog';
import type { JogState } from '@/engine/types';
import { makePose } from './helpers';

function runSignal(
  state: JogState,
  fps: number,
  seconds: number,
  poseAt: (timeMs: number) => ReturnType<typeof makePose>,
) {
  const frameMs = 1000 / fps;
  const frames = Math.ceil(seconds * fps);
  let current = state;
  for (let frame = 0; frame < frames; frame += 1) {
    const nowMs = frame * frameMs;
    current = updateJog(current, poseAt(nowMs), nowMs);
  }
  return current;
}

function smoothJog(lift: number, spm: number, scale: number) {
  const stepFrequencyHz = spm / 60;
  return (timeMs: number) => {
    const delta = lift * Math.sin(2 * Math.PI * (stepFrequencyHz / 2) * timeMs / 1000);
    return makePose({
      scale,
      leftKneeLift: Math.max(delta, 0),
      rightKneeLift: Math.max(-delta, 0),
    });
  };
}

test.each([
  [15, 60, 0.55],
  [15, 180, 1],
  [20, 120, 0.7],
  [30, 180, 1.4],
] as const)('jog: detects a smooth light lift at %i fps, %i spm and scale %f', (fps, spm, scale) => {
  const state = runSignal(createJogState(), fps, 8, smoothJog(0.06, spm, scale));

  assert.equal(state.isJogging, true);
  assert.ok(state.stepCount >= CONFIG.jog.minStepsInWindow, `stepCount was ${state.stepCount}`);
  assert.ok(state.cadenceSpm >= spm - 15 && state.cadenceSpm <= spm + 15, `cadence was ${state.cadenceSpm}`);
});

test('jog: alternating jitter stays below the peak noise gate', () => {
  let current = createJogState();
  for (let frame = 0; frame < 240; frame += 1) {
    const pose = makePose({
      leftKneeLift: frame % 2 === 0 ? 0.04 : 0,
      rightKneeLift: frame % 2 === 1 ? 0.04 : 0,
    });
    current = updateJog(current, pose, frame * (1000 / 30));
  }
  assert.equal(current.isJogging, false);
  assert.equal(current.stepCount, 0);
});

test('jog: symmetric smooth bobbing cancels at every frame rate', () => {
  for (const fps of [15, 20, 30]) {
    const state = runSignal(createJogState(), fps, 8, (timeMs) => {
      const lift = 0.25 * Math.abs(Math.sin(2 * Math.PI * timeMs / 700));
      return makePose({ leftKneeLift: lift, rightKneeLift: lift });
    });
    assert.equal(state.isJogging, false);
    assert.equal(state.stepCount, 0);
  }
});

test('jog: returning knees seed a fresh state without inventing a step', () => {
  let state = runSignal(createJogState(), 30, 4, smoothJog(0.1, 150, 1));
  const stepCount = state.stepCount;

  for (let frame = 0; frame < 20; frame += 1) {
    const hidden = makePose();
    hidden[LANDMARK.LEFT_KNEE] = { ...hidden[LANDMARK.LEFT_KNEE]!, visibility: 0.1 };
    hidden[LANDMARK.RIGHT_KNEE] = { ...hidden[LANDMARK.RIGHT_KNEE]!, visibility: 0.1 };
    state = updateJog(state, hidden, 4000 + frame * (1000 / 30));
  }

  const opposite = makePose({ leftKneeLift: 0, rightKneeLift: 0.08 });
  const resumed = updateJog(state, opposite, 5000);
  assert.equal(resumed.stepCount, stepCount);
  assert.equal(resumed.upKnee, 'RIGHT');
});
