import { expect, test } from 'vitest';
import * as THREE from 'three';
import { createFrameBudget, createQualityMonitor } from '@/engine/render/quality';
import { addLighting } from '@/engine/render/world/lighting';
import { GOLDEN_FOREST } from '@/engine/render/world/palette';
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

test.each(['low', 'medium', 'high'] as const)('%s frame budget caps work on 60/120/144Hz displays', quality => {
  const target = { low: 30, medium: 45, high: 60 }[quality];
  for (const hz of [60, 120, 144]) {
    const budget = createFrameBudget();
    let count = 0;
    for (let frame = 0; frame < hz * 10; frame++) {
      if (budget.consume(frame * 1000 / hz, quality)) count++;
    }
    expect(count).toBeGreaterThanOrEqual(target * 10 - 1);
    expect(count).toBeLessThanOrEqual(target * 10 + 1);
  }
});

test('resetting the budget immediately paints a changed preset without catch-up bursts', () => {
  const budget = createFrameBudget();
  expect(budget.consume(0, 'low')).toBe(true);
  expect(budget.consume(5, 'low')).toBe(false);
  budget.reset();
  expect(budget.consume(5, 'high')).toBe(true);
  expect(budget.consume(5000, 'high')).toBe(true);
  expect(budget.consume(5001, 'high')).toBe(false);
});

test('starting without shadows still configures a usable frustum for a live upgrade', () => {
  const lights = addLighting(THREE, new THREE.Scene(), GOLDEN_FOREST, 0);
  expect(lights.sun.castShadow).toBe(false);
  expect(lights.sun.shadow.camera.left).toBeLessThan(-20);
  expect(lights.sun.shadow.camera.far).toBeGreaterThan(100);
  expect(lights.sun.shadow.normalBias).toBeGreaterThan(0);
});
