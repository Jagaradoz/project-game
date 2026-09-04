'use client';

/**
 * TOR 8: หน้าเกม (Gameplay).
 *
 * The engine is WebGL + getUserMedia + requestAnimationFrame, none of which
 * exist on the server, so the canvas is a client-only dynamic import. In the App
 * Router `ssr: false` is legal only inside a Client Component -- which is why
 * this page carries the directive and the boundary lives right here.
 */

import dynamic from 'next/dynamic';

const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => (
    <main className="mx-auto flex max-w-[720px] flex-col gap-3 p-3">
      <div className="mx-auto grid aspect-3/4 max-h-[78vh] w-full place-items-center rounded-xl bg-panel text-muted">
        Loading the trail...
      </div>
    </main>
  ),
});

export default function PlayPage() {
  return <GameCanvas />;
}
