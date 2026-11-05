'use client';
import { Camera } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { buildChecks } from '@/components/game/CalibrationChecklist';
import { PausedCard } from '@/components/game/PausedCard';
import { Notice } from '@/components/ui/Notice';
import type { GameActions, HudSnapshot } from '@/hooks/useGameRuntime';

/** Movements are not rehearsed here, so only the framing checks can be outstanding. */
const REHEARSED = { hasLeaned: true, hasJogged: true, hasRaisedArms: true, hasHeldHips: true };
const QUIET_LINK = 'cursor-pointer border-0 bg-transparent p-0 text-sm font-bold text-muted underline underline-offset-4 hover:text-ink';

/** Asks for the camera, then coaches framing until GameCanvas starts the run. */
export function GameSetupOverlay({ snapshot, actions, canSkipCamera }: {
  snapshot: HudSnapshot; actions: GameActions; canSkipCamera: boolean;
}) {
  const [isRequesting, setIsRequesting] = useState(false);
  const allowCamera = async () => {
    setIsRequesting(true);
    await actions.startCamera();
    setIsRequesting(false);
  };
  const hint = buildChecks(snapshot, REHEARSED).find(check => !check.isPassing)?.detail ?? 'Loading the trail…';

  return <section className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4" aria-label="Game setup">
    {snapshot.isCameraRunning ? <PausedCard detail={hint} /> : <div className="flex w-full max-w-sm flex-col gap-5 border-2 border-ink bg-surface p-6 shadow-[7px_7px_0_0_var(--color-primary)]">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow">Game Mode</span>
        <h1 className="m-0 text-3xl leading-tight font-black tracking-tight">Get ready to play</h1>
        <p className="m-0 text-sm text-muted">Your body is the controller. Camera frames stay on this device.</p>
      </div>
      {snapshot.error && <Notice tone="error">{snapshot.error}</Notice>}
      <Button size="lg" isFullWidth icon={<Camera size={20} />} isLoading={isRequesting} onClick={allowCamera}>
        {isRequesting ? 'Starting camera…' : 'Allow camera'}
      </Button>
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
        <Link href="/" className={QUIET_LINK}>Home</Link>
        {canSkipCamera && <button type="button" className={QUIET_LINK} onClick={actions.skipCamera}>Development: skip camera</button>}
      </div>
    </div>}
  </section>;
}
