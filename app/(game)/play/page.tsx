'use client';

/**
 * TOR 8: หน้าเกม (Gameplay).
 *
 * The engine is WebGL + getUserMedia + requestAnimationFrame, none of which
 * exist on the server, so the canvas is a client-only dynamic import. In the App
 * Router `ssr: false` is legal only inside a Client Component -- which is why
 * this page carries the directive and the boundary lives right here.
 */

import { SHELL_WIDTH } from '@/components/layout/container';
import dynamic from 'next/dynamic';
import { LoaderCircle } from 'lucide-react';

const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => (
    <main className={`mx-auto flex ${SHELL_WIDTH.wide} flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6`}>
      <div className="mx-auto grid aspect-3/4 max-h-[78vh] w-full place-content-center justify-items-center gap-3 rounded-xl border border-line bg-surface text-muted sm:aspect-4/5 lg:aspect-16/10">
        <LoaderCircle aria-hidden size={28} className="animate-spin" />
        <p className="m-0 text-sm">Loading the trail…</p>
      </div>
    </main>
  ),
});

export default function PlayPage() {
  return <GameCanvas />;
}
