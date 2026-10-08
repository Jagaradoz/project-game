import { expect, test } from 'vitest';
import { createQualityMonitor } from '@/engine/render/quality';
import type { ShadowQuality } from '@/engine/types';

test('quality adapts when a smooth session slows down minutes after startup', () => {
  const monitor = createQualityMonitor();
  let quality: ShadowQuality = 'high';
  const advance = (fps: number, seconds: number) => {
    for (let i = 0; i < fps * seconds; i++) quality = monitor.sample(1000 / fps, quality) ?? quality;
  };
  advance(60, 180); expect(quality).toBe('high');
  advance(30, 8); expect(quality).toBe('medium');
  advance(20, 8); expect(quality).toBe('low');
  advance(60, 60); expect(quality).toBe('low');
});

test('a short slowdown and a background-tab pause do not reduce quality', () => {
  const monitor = createQualityMonitor();
  const sample = (dt: number, count: number, suspended = false) => {
    for (let i = 0; i < count; i++) expect(monitor.sample(dt, 'high', suspended)).toBeNull();
  };
  sample(1000 / 60, 600);
  sample(1000 / 20, 60); // One slow window needs a second one to confirm.
  sample(1000 / 60, 600);
  sample(1000 / 20, 60);
  sample(5000, 1, true);
  sample(1000 / 60, 600);
  for (const dt of [NaN, Infinity, -1, 0, 5000]) sample(dt, 1);
});

test('severely slow visible frames still lower quality', () => {
  const monitor = createQualityMonitor();
  let quality: ShadowQuality = 'high';
  for (let i = 0; i < 30; i++) quality = monitor.sample(500, quality) ?? quality;
  expect(quality).toBe('low');
});
