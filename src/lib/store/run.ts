'use client';

/**
 * The run that just finished, handed from /play to /result.
 *
 * Deliberately NOT persisted. It is a one-way handoff between two screens in
 * the same visit; keeping it in localStorage would mean /result showing a run
 * from days ago to someone who opened it directly. /result falls back to the
 * profile's most recent run when this is empty, which is the honest answer.
 */

import { create } from 'zustand';

import type { RunResult } from '@/types/api';

interface RunState {
  lastRun: RunResult | null;
  setLastRun: (run: RunResult) => void;
  clearLastRun: () => void;
}

export const useRunStore = create<RunState>()((set) => ({
  lastRun: null,
  setLastRun: (lastRun) => set({ lastRun }),
  clearLastRun: () => set({ lastRun: null }),
}));
