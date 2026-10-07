'use client';

/**
 * A number that rolls up to its target instead of jumping, so a kill's points
 * visibly pour into the score while its orbs fly home. Drops (a restart) snap
 * straight down, and reduced motion snaps everything.
 *
 * Every setState happens inside a rAF callback, never in the effect body, so a
 * new target cannot cascade a synchronous re-render.
 */

import { useEffect, useRef, useState } from 'react';

/** Roughly an orb's flight: drop, bounce, pull. */
const DEFAULT_DURATION_MS = 900;

/** Ease-out cubic: fast at first, settling onto the target. */
export function countUpValue(from: number, to: number, progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return Math.round(from + (to - from) * (1 - (1 - clamped) ** 3));
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useCountUp(target: number, durationMs = DEFAULT_DURATION_MS): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return undefined;

    const isInstant = target < from || durationMs <= 0 || prefersReducedMotion();
    let startMs: number | null = null;
    let frame = 0;

    const tick = (nowMs: number) => {
      startMs ??= nowMs;
      const progress = isInstant ? 1 : (nowMs - startMs) / durationMs;
      const value = countUpValue(from, target, progress);
      shownRef.current = value;
      setShown(value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return shown;
}
