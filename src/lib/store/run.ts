'use client';

/**
 * The run that just finished, handed from /play to /result, and whether it
 * made it into the player's saved stats.
 *
 * The summary itself is in memory only, and only the latest run. A logged-in
 * player's run is also posted once to /api/plays; a guest's run is not saved.
 */

import { create } from 'zustand';

import { postPlay } from '@/lib/api/account';
import { useAccount } from '@/lib/store/account';
import type { RunSummary } from '@/engine/types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'guest' | 'error';

interface RunState {
  lastRun: RunSummary | null;
  saveState: SaveState;
  saveError: string | null;
  setLastRun: (run: RunSummary) => void;
  clearLastRun: () => void;
  /** Call once per finished run. */
  saveRun: (run: RunSummary) => Promise<void>;
}

export const useRunStore = create<RunState>()((set) => ({
  lastRun: null,
  saveState: 'idle',
  saveError: null,
  setLastRun: (lastRun) => set({ lastRun }),
  clearLastRun: () => set({ lastRun: null, saveState: 'idle', saveError: null }),
  saveRun: async (run) => {
    // /play has no site header, so a player who opened it directly was never checked.
    if (useAccount.getState().status === 'unknown') await useAccount.getState().refresh();
    if (useAccount.getState().status !== 'user') {
      set({ saveState: 'guest', saveError: null });
      return;
    }
    set({ saveState: 'saving', saveError: null });
    const result = await postPlay({
      score: Math.max(0, Math.round(run.score)),
      distanceM: Math.max(0, Math.round(run.distanceM)),
      durationMs: Math.max(0, Math.round(run.durationMs)),
    });
    if (result.ok) {
      set({ saveState: 'saved' });
      return;
    }
    if (result.status === 401) useAccount.getState().setGuest();
    set({ saveState: result.status === 401 ? 'guest' : 'error', saveError: result.error });
  },
}));
