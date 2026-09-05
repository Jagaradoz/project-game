/** Display formatting. These render stored values, so junk input matters. */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  formatDate,
  formatDateTime,
  formatDelta,
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

test('a delta is signed, and zero says so in words', () => {
  assert.equal(formatDelta(120), '+120');
  assert.equal(formatDelta(-45), '-45');
  assert.equal(formatDelta(0), 'No change');
});

test('dates render, and junk renders a dash', () => {
  const iso = '2026-03-15T08:30:00.000Z';

  // Not asserting the exact string: the locale data decides that, and pinning
  // it would make this test about Intl rather than about the guard clauses.
  assert.ok(formatDate(iso).length > 0);
  assert.notEqual(formatDate(iso), '--');

  assert.equal(formatDate(null), '--');
  assert.equal(formatDate(undefined), '--');
  assert.equal(formatDate(''), '--');
  assert.equal(formatDate('not a date'), '--');
});

test('date-times include a time, and junk renders a dash', () => {
  const rendered = formatDateTime('2026-03-15T08:30:00.000Z');

  assert.notEqual(rendered, '--');
  assert.ok(/\d{2}[:.]\d{2}/.test(rendered), `no time component in "${rendered}"`);

  assert.equal(formatDateTime(null), '--');
  assert.equal(formatDateTime('not a date'), '--');
});
