/** Frame brightness and the calibration verdicts derived from it. */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { CONFIG } from '@/engine/config';
import { classifyDistance, classifyLighting, meanLuma } from '@/engine/util/luma';

const CAL = CONFIG.calibration;

/** RGBA pixel data of one flat colour, as getImageData would report it. */
function solid(r: number, g: number, b: number, pixels = 16): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels * 4);
  for (let index = 0; index < pixels; index += 1) {
    data.set([r, g, b, 255], index * 4);
  }
  return data;
}

test('black is 0 and white is 1', () => {
  assert.equal(meanLuma(solid(0, 0, 0)), 0);
  assert.equal(meanLuma(solid(255, 255, 255)), 1);
});

test('luma is perceptual, not the channel mean', () => {
  // Green reads far brighter than blue at the same channel value; a naive
  // average would call them identical.
  const green = meanLuma(solid(0, 255, 0))!;
  const blue = meanLuma(solid(0, 0, 255))!;

  assert.ok(green > blue);
  assert.ok(Math.abs(green - 0.587) < 1e-6);
  assert.ok(Math.abs(blue - 0.114) < 1e-6);
});

test('mid grey lands mid scale', () => {
  const grey = meanLuma(solid(128, 128, 128))!;
  assert.ok(Math.abs(grey - 128 / 255) < 1e-6);
});

test('a mixed frame averages its pixels', () => {
  const data = new Uint8ClampedArray([...solid(0, 0, 0, 1), ...solid(255, 255, 255, 1)]);
  assert.ok(Math.abs(meanLuma(data)! - 0.5) < 1e-6);
});

test('malformed data yields null rather than NaN', () => {
  assert.equal(meanLuma(null), null);
  assert.equal(meanLuma(undefined), null);
  assert.equal(meanLuma(new Uint8ClampedArray(0)), null);
  assert.equal(meanLuma(new Uint8ClampedArray(3)), null);
});

test('lighting is judged against the configured window', () => {
  assert.equal(classifyLighting(CAL.minLuma - 0.01), 'dark');
  assert.equal(classifyLighting(CAL.maxLuma + 0.01), 'bright');
  assert.equal(classifyLighting((CAL.minLuma + CAL.maxLuma) / 2), 'ok');
  assert.equal(classifyLighting(CAL.minLuma), 'ok', 'the boundary should pass');
  assert.equal(classifyLighting(null), null);
});

test('distance is judged from shoulder width', () => {
  assert.equal(classifyDistance(CAL.minShoulderWidth - 0.01), 'far');
  assert.equal(classifyDistance(CAL.maxShoulderWidth + 0.01), 'close');
  assert.equal(classifyDistance((CAL.minShoulderWidth + CAL.maxShoulderWidth) / 2), 'ok');
  assert.equal(classifyDistance(null), null);
  assert.equal(classifyDistance(Number.NaN), null);
});
