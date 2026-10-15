/** Display formatting. Junk input must render a dash, never NaN. */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  formatDuration,
  formatMetres,
  formatNumber,
} from '@/lib/format';

test('durations read as minutes and seconds, and hours only when needed', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(5_000), '0:05');
  assert.equal(formatDuration(65_000), '1:05');
  assert.equal(formatDuration(303_000), '5:03');
  assert.equal(formatDuration(3_903_000), '1:05:03');
});

test('a bad duration renders a dash, never NaN', () => {
  assert.equal(formatDuration(null), '--');
  assert.equal(formatDuration(undefined), '--');
  assert.equal(formatDuration(Number.NaN), '--');
  assert.equal(formatDuration(-1), '--');
});

test('numbers round and group; nonsense renders a dash', () => {
  assert.equal(formatNumber(1234.6), '1,235');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(Number.NaN), '--');
  assert.equal(formatNumber(null), '--');
});

test('metres carry their unit', () => {
  assert.equal(formatMetres(1500), '1,500 m');
  assert.equal(formatMetres(null), '--');
});
