import { expect, test, vi } from 'vitest';
import { drawLaneGuide } from '@/engine/pose/draw';
import type { LaneGuide } from '@/engine/types';

const guide: LaneGuide = {
  baselineX: 0.5,
  lanes: { left: { enterX: 0.65, exitX: 0.6 }, right: { enterX: 0.35, exitX: 0.4 } },
  label: 'CENTER', isTracking: true, marker: null, calibrationProgress: 1,
};

test.each([120, 140, 320])('lane names remain visible in a %ipx camera preview', width => {
  const fillText = vi.fn();
  const translate = vi.fn();
  const ctx = {
    canvas: { width: 640, height: 480 },
    save: vi.fn(), restore: vi.fn(), scale: vi.fn(), translate, fillText,
    fillRect: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    measureText: () => ({ width: 180 }),
  } as unknown as CanvasRenderingContext2D;
  drawLaneGuide(ctx, guide, 0, width / 640);
  expect(fillText.mock.calls.map(call => call[0])).toEqual(['LEFT', 'CENTRE', 'RIGHT']);
  for (const [x, y] of translate.mock.calls) {
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(640);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(480);
  }
});
