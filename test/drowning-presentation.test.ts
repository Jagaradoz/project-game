import { expect, test } from 'vitest';
import { createDrowningPresentation, updateDrowningPresentation } from '@/engine/core/drowning';

test('drowning starts once and completes after 650ms independently of frozen gameplay time', () => {
  const initial = createDrowningPresentation();
  const started = updateDrowningPresentation(initial, 'drowned', 50, 650);
  expect(started.justStarted).toBe(true);
  expect(started.elapsedMs).toBe(0);
  expect(started.complete).toBe(false);
  const almost = updateDrowningPresentation(started, 'drowned', 649, 650);
  expect(almost.justStarted).toBe(false);
  expect(almost.complete).toBe(false);
  const done = updateDrowningPresentation(almost, 'drowned', 1, 650);
  expect(done.complete).toBe(true);
  expect(updateDrowningPresentation(done, 'drowned', 100, 650).elapsedMs).toBe(650);
});

test('restart clears the presentation and ordinary damage does not delay the overlay', () => {
  const started = updateDrowningPresentation(createDrowningPresentation(), 'drowned', 0, 650);
  expect(updateDrowningPresentation(started, null, 10, 650)).toEqual(createDrowningPresentation());
  expect(updateDrowningPresentation(started, 'damage', 10, 650).complete).toBe(true);
});

test('long render frames complete the effect without extending the defeat delay', () => {
  const started = updateDrowningPresentation(createDrowningPresentation(), 'drowned', 0, 650);
  expect(updateDrowningPresentation(started, 'drowned', 1200, 650).complete).toBe(true);
});
