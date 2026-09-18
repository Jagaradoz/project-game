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
import Image from 'next/image';
import { LoaderCircle } from 'lucide-react';

const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => (
    <main className={`mx-auto flex ${SHELL_WIDTH.wide} flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6`}>
      <div className="mx-auto grid aspect-3/4 w-full max-w-[calc(80vh*3/4)] place-content-center justify-items-center gap-4 rounded-lg border border-line bg-surface text-muted">
        <div className="relative size-10 overflow-hidden rounded-md ring-1 ring-white/10">
          <Image
            src="/icon.png"
            alt="Trail Runner"
            width={40}
            height={40}
            priority
            className="size-full object-cover"
          />
        </div>
        <div className="flex items-center gap-2">
          <LoaderCircle aria-hidden size={18} className="animate-spin text-primary" />
          <p className="m-0 text-sm font-medium text-text/85">Loading the trail…</p>
        </div>
      </div>
    </main>
  ),
});

export default function PlayPage() {
  return <GameCanvas />;
}
