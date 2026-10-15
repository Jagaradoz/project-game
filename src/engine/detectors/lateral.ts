/**
 * Lateral lean / step detector.
 *
 * Written as a pure reducer -- `updateLateral(state, ...) -> newState` -- so it
 * never mutates its input and can be exercised in tests with synthetic
 * landmarks, no browser involved.
 */

import { CONFIG } from '@/engine/config';
import { ema } from '@/engine/util/smooth';
import { measureBody } from '@/engine/util/landmarks';
import type {
  BodyMeasurement,
  LaneGuide,
  LaneThreshold,
  LateralConfig,
  LateralLabel,
  LateralState,
  PoseLandmarks,
} from '@/engine/types';

export const LATERAL = { LEFT: 'LEFT', RIGHT: 'RIGHT', CENTER: 'CENTER' } as const;

export function createLateralState(): LateralState {
  return {
    label: LATERAL.CENTER,
    offset: 0,
    smoothedX: null,
    baseline: null,
    calibrationSamples: [],
    calibrationStartMs: null,
    isCalibrated: false,
    hasBody: false,
    reach: { left: null, right: null },
    excursionPeak: 0,
    shoulderWidth: null,
  };
}

/** Discards the learned center and reach so the player's next centre, left and right re-teach them. */
export function recalibrateLateral(state: LateralState): LateralState {
  return {
    ...state,
    baseline: null,
    calibrationSamples: [],
    calibrationStartMs: null,
    isCalibrated: false,
    label: LATERAL.CENTER,
    offset: 0,
    reach: { left: null, right: null },
    excursionPeak: 0,
  };
}

/**
 * Enter/exit points per side, in shoulder-widths. A side with a learned reach
 * switches at a fixed fraction of how far this player actually steps; an
 * unlearned side uses the configured defaults.
 */
export function laneThresholds(
  state: Pick<LateralState, 'reach'>,
  config: LateralConfig = CONFIG.lateral,
): { left: LaneThreshold; right: LaneThreshold } {
  const exitRatio = config.exitOffset / config.enterOffset;
  const side = (reach: number | null): LaneThreshold => {
    if (reach === null) return { enter: config.enterOffset, exit: config.exitOffset };
    const enter = Math.min(config.maxEnterOffset, Math.max(config.minEnterOffset, reach * config.learnedEnterFraction));
    return { enter, exit: enter * exitRatio };
  };
  return { left: side(state.reach.left), right: side(state.reach.right) };
}

export function updateLateral(
  state: LateralState,
  landmarks: PoseLandmarks | null | undefined,
  nowMs: number,
  config: LateralConfig = CONFIG.lateral,
): LateralState {
  const body = measureBody(landmarks);

  // No confident body: hold the last label rather than snapping to CENTER, which
  // would otherwise flicker every time a limb drops below the visibility bar.
  if (!body) return { ...state, hasBody: false };

  const smoothedX = ema(state.smoothedX, lateralCenter(body, config), config.smoothing);
  const { shoulderWidth } = body;

  if (!state.isCalibrated) {
    return calibrate({ ...state, smoothedX, shoulderWidth, hasBody: true }, smoothedX, nowMs, config);
  }

  const rawOffset = (smoothedX - (state.baseline ?? smoothedX)) / shoulderWidth;
  const offset = config.invertSides ? -rawOffset : rawOffset;

  const label = nextLabel(state.label, offset, laneThresholds(state, config));
  return { ...state, smoothedX, shoulderWidth, hasBody: true, offset, label, ...learnReach(state, label, offset) };
}

/**
 * Projects the detector's thresholds back into the camera frame, so the overlay
 * draws exactly the lines the label switches on: around the calibrated centre,
 * scaled by the current shoulder width, using this player's learned points.
 */
export function laneGuide(
  state: LateralState,
  body: BodyMeasurement | null,
  nowMs: number,
  config: LateralConfig = CONFIG.lateral,
): LaneGuide {
  const isTracking = state.hasBody && body !== null;
  const calibrationProgress = state.isCalibrated ? 1
    : state.calibrationStartMs === null ? 0 : Math.min(1, Math.max(0, (nowMs - state.calibrationStartMs) / config.calibrationMs));
  const marker = body !== null && state.hasBody && state.smoothedX !== null
    ? { x: state.smoothedX, topY: body.shoulderMid.y, bottomY: body.hipMid.y } : null;
  const { baseline, shoulderWidth } = state;
  if (!state.isCalibrated || baseline === null || shoulderWidth === null) {
    return { baselineX: null, lanes: null, label: state.label, isTracking, marker, calibrationProgress };
  }
  // Raw x grows toward the subject's own LEFT unless the sides are inverted.
  const leftward = (config.invertSides ? -1 : 1) * shoulderWidth;
  const { left, right } = laneThresholds(state, config);
  return {
    baselineX: baseline,
    lanes: {
      left: { enterX: baseline + left.enter * leftward, exitX: baseline + left.exit * leftward },
      right: { enterX: baseline - right.enter * leftward, exitX: baseline - right.exit * leftward },
    },
    label: state.label,
    isTracking,
    marker,
    calibrationProgress,
  };
}

/**
 * Tracks how far each LEFT/RIGHT excursion goes, and when the first excursion on
 * a side ends, keeps its peak as that side's reach. Later excursions do not
 * overwrite it, so one big lunge mid-session cannot move the lanes; recalibrating
 * clears it.
 */
function learnReach(
  state: LateralState,
  label: LateralLabel,
  offset: number,
): Pick<LateralState, 'reach' | 'excursionPeak'> {
  const outward = (side: LateralLabel) => (side === LATERAL.LEFT ? offset : -offset);
  const previous = state.label;
  if (previous === label) {
    const excursionPeak = label === LATERAL.CENTER ? 0 : Math.max(state.excursionPeak, outward(label));
    return { reach: state.reach, excursionPeak };
  }
  const excursionPeak = label === LATERAL.CENTER ? 0 : outward(label);
  if (previous === LATERAL.CENTER) return { reach: state.reach, excursionPeak };
  const key = previous === LATERAL.LEFT ? 'left' : 'right';
  const reach = state.reach[key] === null ? { ...state.reach, [key]: state.excursionPeak } : state.reach;
  return { reach, excursionPeak };
}

/**
 * Lateral centre of the body, weighted toward the shoulders.
 *
 * The pelvis swings sideways with every step, so a hip-heavy midline reads a jog
 * in place as lateral movement. The shoulders stay much closer to the true body
 * axis while the legs work, which is what lets leaning and jogging coexist.
 */
function lateralCenter(body: BodyMeasurement, config: LateralConfig): number {
  const shoulderWeight = config.shoulderWeight;
  return shoulderWeight * body.shoulderMid.x + (1 - shoulderWeight) * body.hipMid.x;
}

/** Averages the lateral centre over `calibrationMs` to learn where "standing in the middle" is. */
function calibrate(
  state: LateralState,
  smoothedX: number,
  nowMs: number,
  config: LateralConfig,
): LateralState {
  const startMs = state.calibrationStartMs ?? nowMs;
  const samples = [...state.calibrationSamples, smoothedX];

  if (nowMs - startMs < config.calibrationMs) {
    return { ...state, calibrationStartMs: startMs, calibrationSamples: samples };
  }

  const baseline = samples.reduce((sum, x) => sum + x, 0) / samples.length;
  return {
    ...state,
    calibrationStartMs: startMs,
    calibrationSamples: [],
    baseline,
    isCalibrated: true,
    offset: 0,
    label: LATERAL.CENTER,
  };
}

/**
 * Signed hysteresis: crossing a side's enter point commits to it, and the label is
 * held until the offset falls back inside that side's exit point. A
 * single threshold would chatter whenever the subject hovers on the boundary.
 *
 * The comparisons are signed on purpose. An unsigned `Math.abs(offset) <
 * exitOffset` release latches the first side forever: stepping across to the
 * other side keeps |offset| large, so the old label never releases and the new
 * one never gets a chance to commit.
 */
function nextLabel(
  currentLabel: LateralLabel,
  offset: number,
  { left, right }: { left: LaneThreshold; right: LaneThreshold },
): LateralLabel {
  if (offset > left.enter) return LATERAL.LEFT;
  if (offset < -right.enter) return LATERAL.RIGHT;
  if (currentLabel === LATERAL.LEFT) return offset > left.exit ? LATERAL.LEFT : LATERAL.CENTER;
  if (currentLabel === LATERAL.RIGHT) return offset < -right.exit ? LATERAL.RIGHT : LATERAL.CENTER;
  return LATERAL.CENTER;
}
