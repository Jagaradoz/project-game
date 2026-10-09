'use client';

/**
 * The entire React <-> engine boundary.
 *
 * This component owns the four DOM nodes the engine needs, creates the runtime
 * in an effect, and disposes it on unmount. Nothing else in the app touches the
 * engine, and the engine touches no React.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { createCharacterPreviewRuntime } from '@/engine/runtime';
import type { CharacterPreviewStatus } from '@/engine/render/characterPreview';

import { useGameRuntime } from '@/hooks/useGameRuntime';
import { usePlayDebugTools } from '@/hooks/usePlayDebugTools';
import { getErrorMessage, repository } from '@/lib/api';
import { useRunStore } from '@/lib/store/run';
import { useSettings } from '@/lib/store/settings';
import { CameraPermissionModal } from '@/components/game/CameraPermissionModal';
import { CameraStage } from '@/components/game/CameraStage';
import { GameHud } from '@/components/game/GameHud';
import { GameOverOverlay } from '@/components/game/GameOverOverlay';
import { GraphicsSettings } from '@/components/game/GraphicsSettings';
import { Notice } from '@/components/ui/Notice';

export default function GameCanvas() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const character = useSettings((state) => state.character);
  const graphicsQuality = useSettings((state) => state.graphicsQuality);
  const hideCamera = useSettings((state) => state.hideCamera);
  const setHideCamera = useSettings((state) => state.setHideCamera);
  // Keep the optional local camera bypass on the startup dialog only.
  const showDebugTools = usePlayDebugTools();

  const setLastRun = useRunStore((state) => state.setLastRun);

  const { actions, snapshot } = useGameRuntime(
    {
      container: containerRef,
      gameCanvas: gameCanvasRef,
      video: videoRef,
      overlay: overlayRef,
    },
    { character, graphicsQuality },
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * One idempotency key per finished run, minted when the run ends and cleared
   * when the next one starts. Reusing it across a retry is the point: TOR 3
   * requires that one finished run is never recorded twice, and this screen
   * can submit twice -- once automatically, once if the player presses
   * "See summary".
   */
  const clientRunIdRef = useRef<string | null>(null);
  const submittedRef = useRef(false);

  const submitRun = useCallback(async () => {
    const summary = actions.getRunSummary();
    if (!summary) return null;

    clientRunIdRef.current ??=
      typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const saved = await repository.submitRun({
        ...summary,
        clientRunId: clientRunIdRef.current,
      });
      setLastRun(saved);
      return saved;
    } catch (error: unknown) {
      // A failed save must not swallow the run: the player still sees their
      // result, and the message says the record did not stick.
      setSubmitError(getErrorMessage(error));
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [actions, setLastRun]);

  // Record the run as soon as it ends, so a player who simply closes the tab
  // still keeps their progress.
  useEffect(() => {
    if (!snapshot.isOver || submittedRef.current) return;
    submittedRef.current = true;
    void submitRun();
  }, [snapshot.isOver, submitRun]);

  const restart = useCallback(() => {
    submittedRef.current = false;
    clientRunIdRef.current = null;
    setSubmitError(null);
    actions.restart();
  }, [actions]);

  const seeResult = useCallback(async () => {
    await submitRun();
    router.push('/result');
  }, [router, submitRun]);

  // R or Space restarts once the run is over. Registered here rather than in the
  // engine because it is a UI affordance, not a control input.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!snapshot.isOver) return;
      if (event.key === 'r' || event.key === 'R' || event.key === ' ') {
        event.preventDefault();
        restart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [restart, snapshot.isOver]);

  return (
    <main className="play-screen" aria-label="Exercise game">
      <div id="gameStage" ref={containerRef} className="play-stage">
        <canvas ref={gameCanvasRef} className="block h-full w-full" />
        <GameHud snapshot={snapshot} />
        <details className="absolute bottom-32 left-3 z-30 max-w-[calc(100%_-_24px)] border-2 border-ink bg-surface shadow-[3px_3px_0_var(--color-primary)]">
          <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-bold text-accent-text focus-visible:outline-2 focus-visible:outline-primary">
            Graphics · {graphicsQuality[0].toUpperCase() + graphicsQuality.slice(1)}
          </summary>
          <div className="w-80 max-w-full border-t-2 border-ink p-3">
            <GraphicsSettings activeQuality={snapshot.quality} />
          </div>
        </details>
        <CameraStage
          videoRef={videoRef}
          overlayRef={overlayRef}
          isCameraRunning={snapshot.isCameraRunning}
          isCameraSkipped={snapshot.isCameraSkipped}
          isCameraHidden={hideCamera}
        />
        <GameOverOverlay
          snapshot={snapshot}
          onRestart={() => router.push('/characters')}
          onSeeResult={seeResult}
          isSubmitting={isSubmitting}
        />
        {(snapshot.error && snapshot.isCameraRunning || submitError) && (
          <div className="absolute inset-x-3 top-24 z-30 flex max-h-[40%] flex-col gap-2 overflow-y-auto">
            {snapshot.error && snapshot.isCameraRunning && (
              <Notice tone="error">{snapshot.error}</Notice>
            )}
            {submitError && (
              <Notice tone="error" title="Your result was not saved">{submitError}</Notice>
            )}
          </div>
        )}
      </div>
      {!snapshot.isCameraRunning && !snapshot.isCameraSkipped && (
        <CameraPermissionModal
          error={snapshot.error}
          status={snapshot.status}
          onAllow={actions.startCamera}
          isCameraHidden={hideCamera}
          onToggleCamera={() => setHideCamera(!hideCamera)}
          onSkip={showDebugTools && process.env.NODE_ENV !== 'production' ? actions.skipCamera : undefined}
        />
      )}
    </main>
  );
}

/** The selection page shares this sole React/engine boundary. */
export function MagicianPreviewCanvas({
  containerRef,
  onStatus,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  onStatus: (id: string, status: CharacterPreviewStatus) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const runtime = createCharacterPreviewRuntime(canvas, container, onStatus);
    void runtime.start();
    return () => runtime.dispose();
  }, [containerRef, onStatus]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] h-dvh w-screen" />;
}
