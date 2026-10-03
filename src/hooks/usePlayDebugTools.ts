'use client';

import { useSyncExternalStore } from 'react';

/**
 * Developer chrome on /play: character swap, 3D catalog and the
 * detector panel. Players never see it. Append `?debug=1` to bring it back on a
 * production tunnel; `?debug=0` hides it even in `next dev`.
 */
export function usePlayDebugTools(): boolean {
  return useSyncExternalStore(subscribe, readDebugFlag, readServerFlag);
}

function readServerFlag(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function readDebugFlag(): boolean {
  const flag = new URLSearchParams(window.location.search).get('debug');
  if (flag === '1') return true;
  if (flag === '0') return false;
  return readServerFlag();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}
