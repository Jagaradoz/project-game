import type { DeathReason } from '@/engine/types';

export interface DrowningPresentation {
  active: boolean;
  elapsedMs: number;
  complete: boolean;
  justStarted: boolean;
}

export function createDrowningPresentation(): DrowningPresentation {
  return { active: false, elapsedMs: 0, complete: true, justStarted: false };
}

/** Render time continues after the reducer has frozen the run. */
export function updateDrowningPresentation(
  state: DrowningPresentation, reason: DeathReason | null, dtMs: number, durationMs: number,
): DrowningPresentation {
  if (reason !== 'drowned') return createDrowningPresentation();
  if (!state.active) return { active: true, elapsedMs: 0, complete: false, justStarted: true };
  const elapsedMs = Math.min(durationMs, state.elapsedMs + Math.max(0, dtMs));
  return { active: true, elapsedMs, complete: elapsedMs >= durationMs, justStarted: false };
}
