'use client';

/**
 * The run that just finished, handed from /play to /result.
 *
 * In memory only, and only the latest run: there is no history, no totals and
 * no comparison. Reloading or opening /result directly shows an empty state.
 */

import { create } from 'zustand';

import type { RunSummary } from '@/engine/types';

interface RunState {
  lastRun: RunSummary | null;
  setLastRun: (run: RunSummary) => void;
  clearLastRun: () => void;
}

export const useRunStore = create<RunState>()((set) => ({
  lastRun: null,
  setLastRun: (lastRun) => set({ lastRun }),
  clearLastRun: () => set({ lastRun: null }),
}));
