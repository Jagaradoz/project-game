'use client';

/**
 * Who is signed in, loaded once per mount.
 *
 * Small on purpose. There is no backend yet, so there is nothing to subscribe
 * to and nothing to revalidate -- a page asks once and re-asks after it changes
 * something. When the real API lands this is where caching would go, and no
 * page would have to change.
 */

import { useCallback, useEffect, useState } from 'react';

import { repository } from '@/lib/api';
import type { AuthSession } from '@/types/api';

export interface UseSessionResult {
  session: AuthSession | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useSession(): UseSessionResult {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSession(await repository.getSession());
    } catch {
      // A failed session lookup means "not signed in" as far as the UI is
      // concerned; there is nothing useful to show the player about it.
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Guarded rather than fire-and-forget: without this, a fetch that resolves
    // after the component unmounts sets state on a dead component.
    let isActive = true;

    void (async () => {
      let next: AuthSession | null = null;
      try {
        next = await repository.getSession();
      } catch {
        next = null;
      }
      if (!isActive) return;
      setSession(next);
      setIsLoading(false);
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    await repository.logout();
    setSession(null);
  }, []);

  return { session, isLoading, refresh, signOut };
}
