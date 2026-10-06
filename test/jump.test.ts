import { expect, test } from 'vitest';
import { createJumpState, updateJump } from '@/engine/detectors/jump';
import { makePose } from './helpers';
import { LANDMARK } from '@/engine/config';

function pose(rise = 0, leftRise = rise, rightRise = rise) {
  const p = makePose();
  for (const l of p) l.y -= rise;
  p[LANDMARK.LEFT_ANKLE].y = .92 - leftRise;
  p[LANDMARK.RIGHT_ANKLE].y = .92 - rightRise;
  return p;
}
function calibrated() {
  let s = createJumpState();
  for (let t = 0; t <= 1200; t += 40) s = updateJump(s, pose(), t);
  return s;
}
test('both feet and hips rise: emits once, then rearms only after landing', () => {
  let s = calibrated();
  expect(s.isCalibrated).toBe(true);
  s = updateJump(s, pose(.06), 1240);
  s = updateJump(s, pose(.08), 1280);
  expect(s.justJumped).toBe(true);
  s = updateJump(s, pose(.08), 1320);
  expect(s.justJumped).toBe(false);
  for (let t = 1360; t <= 1720; t += 40) s = updateJump(s, pose(), t);
  s = updateJump(s, pose(.08), 1760);
  s = updateJump(s, pose(.08), 1800);
  expect(s.jumpCount).toBe(2);
});
test('one lifted foot and jogging bob do not count as a jump', () => {
  let s = calibrated();
  for (let t = 1240; t <= 1800; t += 40) s = updateJump(s, pose(.01, .1, 0), t);
  expect(s.jumpCount).toBe(0);
});
test('missing feet disable detection and cannot manufacture a takeoff on reacquisition', () => {
  let s = calibrated();
  const p = pose(.08); p[LANDMARK.LEFT_ANKLE].visibility = 0;
  s = updateJump(s, p, 1240);
  expect(s.feetVisible).toBe(false);
  s = updateJump(s, pose(.08), 1280);
  expect(s.justJumped).toBe(false);
});

test('feet outside the camera frame cannot pass jump calibration', () => {
  let s = createJumpState();
  const p = pose(); p[LANDMARK.LEFT_ANKLE].y = 1.2;
  for (let t = 0; t <= 1200; t += 40) s = updateJump(s, p, t);
  expect(s.feetVisible).toBe(false);
  expect(s.isCalibrated).toBe(false);
});
