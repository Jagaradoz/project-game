import { test } from 'vitest';
import assert from 'node:assert/strict';

import { CONFIG, LANDMARK } from '@/engine/config';
import { cadenceSpm, ema } from '@/engine/util/smooth';
import { measureBody } from '@/engine/util/landmarks';
import { createLateralState, updateLateral, recalibrateLateral, laneGuide, laneThresholds, LATERAL } from '@/engine/detectors/lateral';
import { createJogState, updateJog } from '@/engine/detectors/jog';
import { makePose, run, FRAME_MS } from './helpers';
import type { LateralState, PoseLandmarks } from '@/engine/types';

const CALIBRATION_FRAMES = Math.ceil(CONFIG.lateral.calibrationMs / FRAME_MS) + 5;
const SETTLE_FRAMES = 30;

/** Shoulder width of the synthetic pose, so tests can express offsets in shoulder-widths. */
const shoulderWidthAt = (scale: number) => 0.24 * scale;

/** Square-wave knee alternation: `lift` torso-lengths, flipping every `phaseMs`. */
const alternatingKnees = (lift: number, phaseMs: number) => (frameIndex: number): PoseLandmarks => {
  const framesPerPhase = Math.round(phaseMs / FRAME_MS);
  const isLeftUp = Math.floor(frameIndex / framesPerPhase) % 2 === 0;
  return makePose({ leftKneeLift: isLeftUp ? lift : 0, rightKneeLift: isLeftUp ? 0 : lift });
};

/** Runs calibration at `centerX`, then holds a pose offset by `offsetSw` shoulder-widths. */
function calibrateThenOffset(
  offsetSw: number,
  {
    scale = 1,
    centerX = 0.5,
    state = createLateralState(),
  }: { scale?: number; centerX?: number; state?: LateralState } = {},
) {
  const calibrated = run(state, updateLateral, CALIBRATION_FRAMES, () => makePose({ centerX, scale }));
  const shifted = centerX + offsetSw * shoulderWidthAt(scale);
  return run(calibrated.state, updateLateral, SETTLE_FRAMES, () => makePose({ centerX: shifted, scale }), calibrated.endMs);
}

test('measureBody returns null when required landmarks are not visible', () => {
  const pose = makePose();
  pose[LANDMARK.LEFT_HIP] = { ...pose[LANDMARK.LEFT_HIP]!, visibility: 0.1 };
  assert.equal(measureBody(pose), null);
});

test('measureBody normalises by shoulder width and torso length', () => {
  const full = measureBody(makePose({ scale: 1 }))!;
  const half = measureBody(makePose({ scale: 0.5 }))!;

  assert.ok(Math.abs(full.shoulderWidth - 0.24) < 1e-9);
  assert.ok(Math.abs(half.shoulderWidth - 0.12) < 1e-9);
  assert.ok(Math.abs(full.torsoLength - 0.2) < 1e-9);
});

test('ema seeds from the first sample instead of dragging toward zero', () => {
  assert.equal(ema(null, 7, 0.5), 7);
  assert.equal(ema(0, 10, 0.5), 5);
});

test('lateral: calibrates to centre and reports CENTER while standing still', () => {
  const { state } = run(createLateralState(), updateLateral, CALIBRATION_FRAMES, () => makePose({ centerX: 0.5 }));

  assert.equal(state.isCalibrated, true);
  assert.ok(Math.abs(state.baseline! - 0.5) < 1e-6);
  assert.equal(state.label, LATERAL.CENTER);
});

test('lateral: stepping to the subject\'s own left reports LEFT', () => {
  const { state } = calibrateThenOffset(0.7);

  assert.equal(state.label, LATERAL.LEFT);
  assert.ok(state.offset > CONFIG.lateral.enterOffset, `offset was ${state.offset}`);
});

test('lateral: stepping to the subject\'s own right reports RIGHT', () => {
  const { state } = calibrateThenOffset(-0.7);

  assert.equal(state.label, LATERAL.RIGHT);
  assert.ok(state.offset < -CONFIG.lateral.enterOffset, `offset was ${state.offset}`);
});

test('lateral: thresholds are distance-invariant', () => {
  // Same pose at half size (subject twice as far away) must give the same label
  // and, critically, the same normalised offset.
  const near = calibrateThenOffset(0.7, { scale: 1 });
  const far = calibrateThenOffset(0.7, { scale: 0.5 });

  assert.equal(near.state.label, LATERAL.LEFT);
  assert.equal(far.state.label, LATERAL.LEFT);
  assert.ok(Math.abs(near.state.offset - far.state.offset) < 1e-6);
});

test('lateral: hysteresis holds CENTER inside the dead band', () => {
  // 0.4 sits above exitOffset (0.30) but below enterOffset (0.50).
  const { state } = calibrateThenOffset(0.4);
  assert.equal(state.label, LATERAL.CENTER);
});

test('lateral: hysteresis holds a committed side inside the dead band', () => {
  const committed = calibrateThenOffset(0.7);
  assert.equal(committed.state.label, LATERAL.LEFT);

  const shifted = 0.5 + 0.4 * shoulderWidthAt(1);
  const { state } = run(
    committed.state,
    updateLateral,
    SETTLE_FRAMES,
    () => makePose({ centerX: shifted }),
    committed.endMs,
  );

  assert.equal(state.label, LATERAL.LEFT, 'should not drop to CENTER until it falls under exitOffset');
});

test('lateral: falling under exitOffset releases back to CENTER', () => {
  const committed = calibrateThenOffset(0.7);
  const { state } = run(committed.state, updateLateral, SETTLE_FRAMES, () => makePose({ centerX: 0.5 }), committed.endMs);

  assert.equal(state.label, LATERAL.CENTER);
});

test('lateral: stepping straight across from one side to the other flips the label', () => {
  // The regression that made the HUD read LEFT forever: unsigned hysteresis never
  // released the committed side, because |offset| stays large on the far side too.
  const left = calibrateThenOffset(0.7);
  assert.equal(left.state.label, LATERAL.LEFT);

  const acrossX = 0.5 - 0.7 * shoulderWidthAt(1);
  const { state } = run(left.state, updateLateral, SETTLE_FRAMES, () => makePose({ centerX: acrossX }), left.endMs);

  assert.equal(state.label, LATERAL.RIGHT);
});

test('lateral: a committed side releases once the offset crosses the baseline', () => {
  const left = calibrateThenOffset(0.7);

  // Just past centre toward the other side: too small to commit RIGHT, but well
  // past the point where LEFT should still be held.
  const pastCentreX = 0.5 - 0.4 * shoulderWidthAt(1);
  const { state } = run(left.state, updateLateral, SETTLE_FRAMES, () => makePose({ centerX: pastCentreX }), left.endMs);

  assert.equal(state.label, LATERAL.CENTER);
});

test('lateral: pelvis swing from jogging in place does not leave CENTER', () => {
  const calibrated = run(createLateralState(), updateLateral, CALIBRATION_FRAMES, () => makePose({ centerX: 0.5 }));

  // Hips swing a third of a shoulder-width each way -- past enterOffset if the
  // midline were hip-weighted -- while the shoulders stay put.
  const swingX = 0.35 * shoulderWidthAt(1);
  const { state } = run(
    calibrated.state,
    updateLateral,
    96,
    (frameIndex: number) =>
      makePose({
        centerX: 0.5,
        hipShift: Math.floor(frameIndex / 12) % 2 === 0 ? swingX : -swingX,
        leftKneeLift: Math.floor(frameIndex / 12) % 2 === 0 ? 0.35 : 0,
        rightKneeLift: Math.floor(frameIndex / 12) % 2 === 0 ? 0 : 0.35,
      }),
    calibrated.endMs,
  );

  assert.equal(state.label, LATERAL.CENTER, `offset reached ${state.offset}`);
});

test('lateral: leaning while jogging still reports the side', () => {
  const calibrated = run(createLateralState(), updateLateral, CALIBRATION_FRAMES, () => makePose({ centerX: 0.5 }));

  const leanX = 0.5 - 0.6 * shoulderWidthAt(1);
  const swingX = 0.35 * shoulderWidthAt(1);
  const { state } = run(
    calibrated.state,
    updateLateral,
    96,
    (frameIndex: number) => {
      const isLeftUp = Math.floor(frameIndex / 12) % 2 === 0;
      return makePose({
        centerX: leanX,
        hipShift: isLeftUp ? swingX : -swingX,
        leftKneeLift: isLeftUp ? 0.35 : 0,
        rightKneeLift: isLeftUp ? 0 : 0.35,
      });
    },
    calibrated.endMs,
  );

  assert.equal(state.label, LATERAL.RIGHT, `offset reached ${state.offset}`);
});

test('lateral: jogging in place does not drag the label off CENTER over time', () => {
  // Same alternation as the jog detector test, checked against the lateral state
  // so the two detections are confirmed to coexist.
  const calibrated = run(createLateralState(), updateLateral, CALIBRATION_FRAMES, () => makePose({ centerX: 0.5 }));
  const jogged = run(calibrated.state, updateLateral, 96, alternatingKnees(0.35, 400), calibrated.endMs);

  assert.equal(jogged.state.label, LATERAL.CENTER);
});

test('lateral: an unusable frame holds the previous label instead of snapping to CENTER', () => {
  const committed = calibrateThenOffset(0.7);
  const held = updateLateral(committed.state, null, committed.endMs);

  assert.equal(held.label, LATERAL.LEFT);
  assert.equal(held.hasBody, false);
});

/** Calibrates, steps out to `reachSw` and back, so that side has learned its reach. */
function learnReach(reachSw: number) {
  const out = calibrateThenOffset(reachSw);
  return run(out.state, updateLateral, SETTLE_FRAMES, () => makePose({ centerX: 0.5 }), out.endMs);
}

const holdAt = (from: { state: LateralState; endMs: number }, offsetSw: number) =>
  run(from.state, updateLateral, SETTLE_FRAMES, () => makePose({ centerX: 0.5 + offsetSw * shoulderWidthAt(1) }), from.endMs);

test('lateral: a wide first step raises that side\'s switch point', () => {
  const learned = learnReach(1.3);
  assert.ok(Math.abs(learned.state.reach.left! - 1.3) < 0.02, `reach was ${learned.state.reach.left}`);

  // 0.6 commits LEFT on the default threshold, but is under 55% of a 1.3 step.
  assert.equal(holdAt(learned, 0.6).state.label, LATERAL.CENTER);
  assert.equal(holdAt(learned, 0.8).state.label, LATERAL.LEFT);
});

test('lateral: a small first step lowers that side\'s switch point', () => {
  const learned = learnReach(0.55);

  // 0.4 is under the default 0.5, but over 55% of a 0.55 step (clamped to the 0.3 floor).
  assert.equal(holdAt(learned, 0.4).state.label, LATERAL.LEFT);
});

test('lateral: each side learns its own reach', () => {
  const learned = learnReach(1.3);

  assert.equal(learned.state.reach.right, null);
  assert.equal(holdAt(learned, -0.6).state.label, LATERAL.RIGHT, 'right keeps the default threshold');
});

test('lateral: learned switch points are clamped and keep the hysteresis ratio', () => {
  const state = { ...createLateralState(), reach: { left: 5, right: 0.1 } };
  const { left, right } = laneThresholds(state);
  const ratio = CONFIG.lateral.exitOffset / CONFIG.lateral.enterOffset;

  assert.equal(left.enter, CONFIG.lateral.maxEnterOffset);
  assert.equal(right.enter, CONFIG.lateral.minEnterOffset);
  assert.ok(Math.abs(left.exit - left.enter * ratio) < 1e-9);
  assert.deepEqual(laneThresholds(createLateralState()).left, { enter: CONFIG.lateral.enterOffset, exit: CONFIG.lateral.exitOffset });
});

test('lateral: only the first excursion per side is learned', () => {
  const first = learnReach(0.7);
  const second = run(holdAt(first, 1.2).state, updateLateral, SETTLE_FRAMES, () => makePose({ centerX: 0.5 }), holdAt(first, 1.2).endMs);

  assert.ok(Math.abs(second.state.reach.left! - 0.7) < 0.02, `reach was ${second.state.reach.left}`);
});

test('lateral: recalibrate forgets the learned reach', () => {
  const reset = recalibrateLateral(learnReach(1.0).state);
  assert.deepEqual(reset.reach, { left: null, right: null });
});

test('laneGuide: shows calibration progress and no lanes before a baseline exists', () => {
  const pose = makePose({ centerX: 0.5 });
  const started = updateLateral(createLateralState(), pose, 0);
  const guide = laneGuide(started, measureBody(pose), CONFIG.lateral.calibrationMs / 2);

  assert.equal(guide.lanes, null);
  assert.equal(guide.baselineX, null);
  assert.ok(Math.abs(guide.calibrationProgress - 0.5) < 1e-9);
  assert.equal(laneGuide(createLateralState(), null, 0).calibrationProgress, 0);
});

test('laneGuide: lines sit where the label actually switches, scaled by shoulder width', () => {
  const { state } = calibrateThenOffset(0, { scale: 0.5 });
  const guide = laneGuide(state, measureBody(makePose({ centerX: 0.5, scale: 0.5 })), 0);
  const sw = shoulderWidthAt(0.5);

  assert.equal(guide.calibrationProgress, 1);
  assert.ok(Math.abs(guide.lanes!.left.enterX - (0.5 + CONFIG.lateral.enterOffset * sw)) < 1e-6);
  assert.ok(Math.abs(guide.lanes!.right.exitX - (0.5 - CONFIG.lateral.exitOffset * sw)) < 1e-6);
  assert.ok(guide.marker && Math.abs(guide.marker.x - 0.5) < 1e-6 && guide.marker.topY < guide.marker.bottomY);
});

test('laneGuide: a learned side moves only its own line', () => {
  const learned = learnReach(1.3);
  const guide = laneGuide(learned.state, measureBody(makePose({ centerX: 0.5 })), 0);
  const sw = shoulderWidthAt(1);

  assert.ok(guide.lanes!.left.enterX - 0.5 > CONFIG.lateral.enterOffset * sw + 1e-3);
  assert.ok(Math.abs(0.5 - guide.lanes!.right.enterX - CONFIG.lateral.enterOffset * sw) < 1e-6);
});

test('laneGuide: inverted sides mirror the lines and a lost body keeps them without a marker', () => {
  const config = { ...CONFIG.lateral, invertSides: true };
  const calibrated = run(createLateralState(), (s, l, t) => updateLateral(s, l, t, config), CALIBRATION_FRAMES, () => makePose({ centerX: 0.5 }));
  const lost = updateLateral(calibrated.state, null, calibrated.endMs, config);
  const guide = laneGuide(lost, null, calibrated.endMs, config);

  assert.ok(guide.lanes!.left.enterX < 0.5);
  assert.equal(guide.isTracking, false);
  assert.equal(guide.marker, null);
});

test('lateral: recalibrate clears the learned baseline', () => {
  const { state } = calibrateThenOffset(0.7);
  const reset = recalibrateLateral(state);

  assert.equal(reset.isCalibrated, false);
  assert.equal(reset.baseline, null);
  assert.equal(reset.label, LATERAL.CENTER);
});

test('jog: alternating knees at a human cadence is detected', () => {
  const { state } = run(createJogState(), updateJog, 96, alternatingKnees(0.35, 400));

  assert.equal(state.isJogging, true);
  assert.ok(state.stepCount >= CONFIG.jog.minStepsInWindow, `stepCount was ${state.stepCount}`);
  assert.ok(
    state.cadenceSpm >= CONFIG.jog.minCadenceSpm && state.cadenceSpm <= CONFIG.jog.maxCadenceSpm,
    `cadence was ${state.cadenceSpm}`,
  );
});

test('jog: a small, low-lift jog is still detected', () => {
  // Knees barely leave the rest position -- 15% of a torso length, roughly a
  // shuffle in place rather than a high-knee jog.
  const { state } = run(createJogState(), updateJog, 96, alternatingKnees(0.15, 400));

  assert.equal(state.isJogging, true);
  assert.ok(state.stepCount >= CONFIG.jog.minStepsInWindow, `stepCount was ${state.stepCount}`);
});

test('jog: symmetric bobbing is rejected', () => {
  // Both knees rise and fall together -- exactly what a squat or a whole-body
  // bob looks like. The differential signal cancels it to zero.
  const { state } = run(createJogState(), updateJog, 96, (frameIndex: number) => {
    const lift = 0.35 * (Math.floor(frameIndex / 12) % 2 === 0 ? 1 : 0);
    return makePose({ leftKneeLift: lift, rightKneeLift: lift });
  });

  assert.equal(state.isJogging, false);
  assert.equal(state.stepCount, 0);
});

test('jog: a shuffle barely lifting the knees is detected', () => {
  // 8% of a torso length -- the height the game asks for. This was below the
  // original peak gate; it locks in the retune that made jogging less strict.
  const { state } = run(createJogState(), updateJog, 96, alternatingKnees(0.08, 400));

  assert.equal(state.isJogging, true);
  assert.ok(state.stepCount >= CONFIG.jog.minStepsInWindow, `stepCount was ${state.stepCount}`);
});

test('jog: alternation below the noise gate is rejected', () => {
  // Crossings alone are not enough; the signal must reach the amplitude gate.
  const { state } = run(createJogState(), updateJog, 96, alternatingKnees(0.035, 400));

  assert.equal(state.stepCount, 0);
  assert.equal(state.isJogging, false);
});

test('jog: lateral stepping alone does not register as jogging', () => {
  const { state } = run(createJogState(), updateJog, 96, (frameIndex: number) =>
    makePose({ centerX: 0.5 + 0.1 * Math.sin(frameIndex / 6) }),
  );

  assert.equal(state.isJogging, false);
  assert.equal(state.stepCount, 0);
});

test('jog: stops being detected after the timeout with no further steps', () => {
  const jogging = run(createJogState(), updateJog, 96, alternatingKnees(0.35, 400));
  assert.equal(jogging.state.isJogging, true);

  const stillFrames = Math.ceil((CONFIG.jog.timeoutMs + 200) / FRAME_MS);
  const { state } = run(jogging.state, updateJog, stillFrames, () => makePose(), jogging.endMs);

  assert.equal(state.isJogging, false);
});

test('jog: knees out of frame freezes the state machine and lets jogging time out', () => {
  const jogging = run(createJogState(), updateJog, 96, alternatingKnees(0.35, 400));

  const hidden = () => {
    const pose = makePose();
    pose[LANDMARK.LEFT_KNEE] = { ...pose[LANDMARK.LEFT_KNEE], visibility: 0.1 };
    pose[LANDMARK.RIGHT_KNEE] = { ...pose[LANDMARK.RIGHT_KNEE], visibility: 0.1 };
    return pose;
  };

  const stillFrames = Math.ceil((CONFIG.jog.timeoutMs + 200) / FRAME_MS);
  const { state } = run(jogging.state, updateJog, stillFrames, hidden, jogging.endMs);

  assert.equal(state.hasKnees, false);
  assert.equal(state.isJogging, false);
  assert.equal(state.stepCount, jogging.state.stepCount, 'no phantom steps while the knees are hidden');
});

test('cadenceSpm converts step timestamps to steps per minute', () => {
  assert.equal(cadenceSpm([0, 400, 800, 1200]), 150);
  assert.equal(cadenceSpm([100]), 0);
  assert.equal(cadenceSpm([]), 0);
});
