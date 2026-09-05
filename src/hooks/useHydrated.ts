'use client';

/**
 * Whether a persisted zustand store has finished reading localStorage.
 *
 * The server renders with the store's defaults and the client's first render
 * must match, so anything gated on stored state has to wait one beat. Doing
 * that with an effect and setState causes a cascading render; subscribing to
 * the store's own hydration event does not, and it is the more direct answer:
 * the store already knows.
 *
 * The optional chaining is not defensive padding. zustand's persist middleware
 * resolves its storage as `window.localStorage` at module scope, and when
 * `window` does not exist it returns early WITHOUT attaching `store.persist` at
 * all -- so during a server render, or a prerender at build time, the API is
 * genuinely absent. Reaching for it unguarded crashes the build.
 */

import { useCallback, useSyncExternalStore } from 'react';

interface HydrationApi {
  hasHydrated: () => boolean;
  onFinishHydration: (callback: () => void) => () => void;
}

/** A persisted store, as seen from an environment that may not have storage. */
interface MaybePersisted {
  persist?: HydrationApi;
}

/** Stable no-op unsubscribe, for when there is nothing to subscribe to. */
const noop = () => {};

export function useHydrated(store: MaybePersisted): boolean {
  const api = store.persist;

  const subscribe = useCallback(
    (onChange: () => void) => api?.onFinishHydration(onChange) ?? noop,
    [api],
  );

  const getSnapshot = useCallback(() => api?.hasHydrated() ?? false, [api]);

  // The server has no stored state, so it is never hydrated. Returning false
  // here is what keeps the first client render identical to the server's.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
