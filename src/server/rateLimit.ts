/** Fixed-window attempt counter, in memory. Enough for one Node process. */

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  /** Counts one attempt; returns false once the key is over its budget. */
  allow(key: string, nowMs: number): boolean;
}

export function createRateLimiter(maxAttempts: number, windowMs: number): RateLimiter {
  const windows = new Map<string, Window>();

  return {
    allow(key, nowMs) {
      const current = windows.get(key);
      const next: Window =
        current && current.resetAt > nowMs
          ? { count: current.count + 1, resetAt: current.resetAt }
          : { count: 1, resetAt: nowMs + windowMs };
      windows.set(key, next);
      return next.count <= maxAttempts;
    },
  };
}
