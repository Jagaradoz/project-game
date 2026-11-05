'use client';

/**
 * Who is logged in, as the header and the run hand-off see it.
 *
 * The session itself lives in an HttpOnly cookie the page cannot read; this
 * store only mirrors what /api/me last said. `unknown` until the first check
 * so the header does not flash "Log in" at someone who is logged in.
 */

import { create } from 'zustand';

import { fetchMe, logoutAccount } from '@/lib/api/account';

export type AccountStatus = 'unknown' | 'guest' | 'user';

interface AccountState {
  status: AccountStatus;
  username: string | null;
  refresh: () => Promise<void>;
  setUser: (username: string) => void;
  setGuest: () => void;
  logout: () => Promise<void>;
}

export const useAccount = create<AccountState>()((set) => ({
  status: 'unknown',
  username: null,
  refresh: async () => {
    const result = await fetchMe();
    set(result.ok ? { status: 'user', username: result.data.username } : { status: 'guest', username: null });
  },
  setUser: (username) => set({ status: 'user', username }),
  setGuest: () => set({ status: 'guest', username: null }),
  logout: async () => {
    await logoutAccount();
    set({ status: 'guest', username: null });
  },
}));
