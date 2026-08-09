import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG, LANDMARK } from '../src/config.js';
import { cadenceSpm, ema } from '../src/util/smooth.js';
import { measureBody } from '../src/util/landmarks.js';
import { createLateralState, updateLateral, recalibrateLateral, LATERAL } from '../src/detectors/lateral.js';
import { createJogState, updateJog } from '../src/detectors/jog.js';
import { makePose, run, FRAME_MS } from './helpers.js';

const CALIBRATION_FRAMES = Math.ceil(CONFIG.lateral.calibrationMs / FRAME_MS) + 5;
const SETTLE_FRAMES = 30;

/** Shoulder width of the synthetic pose, so tests can express offsets in shoulder-widths. */
const shoulderWidthAt = (scale) => 0.24 * scale;

/** Square-wave knee alternation: `lift` torso-lengths, flipping every `phaseMs`. */
const alternatingKnees = (lift, phaseMs) => (frameIndex) => {
  const framesPerPhase = Math.round(phaseMs / FRAME_MS);
  const isLeftUp = Math.floor(frameIndex / framesPerPhase) % 2 === 0;
  return makePose({ leftKneeLift: isLeftUp ? lift : 0, rightKneeLift: isLeftUp ? 0 : lift });
};

/** Runs calibration at `centerX`, then holds a pose offset by `offsetSw` shoulder-widths. */
function calibrateThenOffset(offsetSw, { scale = 1, centerX = 0.5, state = createLateralState() } = {}) {
  const calibrated = run(state, updateLateral, CALIBRATION_FRAMES, () => makePose({ centerX, scale }));
  const shifted = centerX + offsetSw * shoulderWidthAt(scale);
  return run(calibrated.state, updateLateral, SETTLE_FRAMES, () => makePose({ centerX: shifted, scale }), calibrated.endMs);
}

test('measureBody returns null when required landmarks are not visible', () => {
  const pose = makePose();
  pose[LANDMARK.LEFT_HIP] = { ...pose[LANDMARK.LEFT_HIP], visibility: 0.1 };
  assert.equal(measureBody(pose), null);
});

test('measureBody normalises by shoulder width and torso length', () => {
  const full = measureBody(makePose({ scale: 1 }));
  const half = measureBody(makePose({ scale: 0.5 }));

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
  assert.ok(Math.abs(state.baseline - 0.5) < 1e-6);
  assert.equal(state.label, LATERAL.CENTER);
});

test('lateral: stepping to the subject\'s own left reports LEFT', () => {
  const { state } = calibrateThenOffset(0.5);

  assert.equal(state.label, LATERAL.LEFT);
  assert.ok(state.offset > CONFIG.lateral.enterOffset, `offset was ${state.offset}`);
});

test('lateral: stepping to the subject\'s own right reports RIGHT', () => {
  const { state } = calibrateThenOffset(-0.5);

  assert.equal(state.label, LATERAL.RIGHT);
  assert.ok(state.offset < -CONFIG.lateral.enterOffset, `offset was ${state.offset}`);
});

test('lateral: thresholds are distance-invariant', () => {
  // Same pose at half size (subject twice as far away) must give the same label
  // and, critically, the same normalised offset.
  const near = calibrateThenOffset(0.5, { scale: 1 });
  const far = calibrateThenOffset(0.5, { scale: 0.5 });

  assert.equal(near.state.label, LATERAL.LEFT);
  assert.equal(far.state.label, LATERAL.LEFT);
  assert.ok(Math.abs(near.state.offset - far.state.offset) < 1e-6);
});

test('lateral: hysteresis holds CENTER inside the dead band', () => {
  // 0.28 sits above exitOffset (0.20) but below enterOffset (0.35).
  const { state } = calibrateThenOffset(0.28);
  assert.equal(state.label, LATERAL.CENTER);
});

test('lateral: hysteresis holds a committed side inside the dead band', () => {
  const committed = calibrateThenOffset(0.5);
  assert.equal(committed.state.label, LATERAL.LEFT);

  const shifted = 0.5 + 0.28 * shoulderWidthAt(1);
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
  const committed = calibrateThenOffset(0.5);
  const { state } = run(committed.state, updateLateral, SETTLE_FRAMES, () => makePose({ centerX: 0.5 }), committed.endMs);

  assert.equal(state.label, LATERAL.CENTER);
});

test('lateral: stepping straight across from one side to the other flips the label', () => {
  // The regression that made the HUD read LEFT forever: unsigned hysteresis never
  // released the committed side, because |offset| stays large on the far side too.
  const left = calibrateThenOffset(0.5);
  assert.equal(left.state.label, LATERAL.LEFT);

  const acrossX = 0.5 - 0.5 * shoulderWidthAt(1);
  const { state } = run(left.state, updateLateral, SETTLE_FRAMES, () => makePose({ centerX: acrossX }), left.endMs);

  assert.equal(state.label, LATERAL.RIGHT);
});

test('lateral: a committed side releases once the offset crosses the baseline', () => {
  const left = calibrateThenOffset(0.5);

  // Just past centre toward the other side: too small to commit RIGHT, but well
  // past the point where LEFT should still be held.
  const pastCentreX = 0.5 - 0.28 * shoulderWidthAt(1);
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
    (frameIndex) =>
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
    (frameIndex) => {
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
  const committed = calibrateThenOffset(0.5);
  const held = updateLateral(committed.state, null, committed.endMs);

  assert.equal(held.label, LATERAL.LEFT);
  assert.equal(held.hasBody, false);
});

test('lateral: recalibrate clears the learned baseline', () => {
  const { state } = calibrateThenOffset(0.5);
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
  const { state } = run(createJogState(), updateJog, 96, (frameIndex) => {
    const lift = 0.35 * (Math.floor(frameIndex / 12) % 2 === 0 ? 1 : 0);
    return makePose({ leftKneeLift: lift, rightKneeLift: lift });
  });

  assert.equal(state.isJogging, false);
  assert.equal(state.stepCount, 0);
});

test('jog: alternation too shallow to clear the peak gate is rejected', () => {
  // 0.08 crosses crossThreshold (0.06) so the state machine flips, but never
  // reaches peakThreshold (0.10), so no step is committed.
  const { state } = run(createJogState(), updateJog, 96, alternatingKnees(0.08, 400));

  assert.equal(state.stepCount, 0);
  assert.equal(state.isJogging, false);
});

test('jog: lateral stepping alone does not register as jogging', () => {
  const { state } = run(createJogState(), updateJog, 96, (frameIndex) =>
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
