/**
 * Lateral lean / step detector.
 *
 * Written as a pure reducer -- `updateLateral(state, ...) -> newState` -- so it
 * never mutates its input and can be exercised in tests with synthetic
 * landmarks, no browser involved.
 */

import { CONFIG } from '../config.js';
import { ema } from '../util/smooth.js';
import { measureBody } from '../util/landmarks.js';

export const LATERAL = { LEFT: 'LEFT', RIGHT: 'RIGHT', CENTER: 'CENTER' };

export function createLateralState() {
  return {
    label: LATERAL.CENTER,
    offset: 0,
    smoothedX: null,
    baseline: null,
    calibrationSamples: [],
    calibrationStartMs: null,
    isCalibrated: false,
    hasBody: false,
  };
}

/** Discards the learned center so the next second of standing still re-learns it. */
export function recalibrateLateral(state) {
  return {
    ...state,
    baseline: null,
    calibrationSamples: [],
    calibrationStartMs: null,
    isCalibrated: false,
    label: LATERAL.CENTER,
    offset: 0,
  };
}

export function updateLateral(state, landmarks, nowMs, config = CONFIG.lateral) {
  const body = measureBody(landmarks);

  // No confident body: hold the last label rather than snapping to CENTER, which
  // would otherwise flicker every time a limb drops below the visibility bar.
  if (!body) return { ...state, hasBody: false };

  const smoothedX = ema(state.smoothedX, body.centerX, config.smoothing);

  if (!state.isCalibrated) {
    return calibrate({ ...state, smoothedX, hasBody: true }, smoothedX, nowMs, config);
  }

  const rawOffset = (smoothedX - state.baseline) / body.shoulderWidth;
  const offset = config.invertSides ? -rawOffset : rawOffset;

  return { ...state, smoothedX, hasBody: true, offset, label: nextLabel(state.label, offset, config) };
}

/** Averages centerX over `calibrationMs` to learn where "standing in the middle" is. */
function calibrate(state, smoothedX, nowMs, config) {
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
 * Hysteresis: crossing `enterOffset` commits to a side, and only falling back
 * inside `exitOffset` releases it. A single threshold would chatter whenever the
 * subject hovers on the boundary.
 */
function nextLabel(currentLabel, offset, config) {
  if (currentLabel === LATERAL.CENTER) {
    if (offset > config.enterOffset) return LATERAL.LEFT;
    if (offset < -config.enterOffset) return LATERAL.RIGHT;
    return LATERAL.CENTER;
  }
  return Math.abs(offset) < config.exitOffset ? LATERAL.CENTER : currentLabel;
}
