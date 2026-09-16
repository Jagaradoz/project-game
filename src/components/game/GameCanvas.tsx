'use client';

/**
 * The entire React <-> engine boundary.
 *
 * This component owns the four DOM nodes the engine needs, creates the runtime
 * in an effect, and disposes it on unmount. Nothing else in the app touches the
 * engine, and the engine touches no React.
 */

import { useRouter } from 'next/navigation';
import { Footprints, MoveHorizontal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useGameRuntime } from '@/hooks/useGameRuntime';
import { getErrorMessage, repository } from '@/lib/api';
import { useRunStore } from '@/lib/store/run';
import { useSettings, useStageSelection } from '@/lib/store/settings';
import { CameraStage } from '@/components/game/CameraStage';
import { DetectorDebugPanel } from '@/components/game/DetectorDebugPanel';
import { GameHud } from '@/components/game/GameHud';
import { GameOverOverlay } from '@/components/game/GameOverOverlay';
import { ScenePickers } from '@/components/game/ScenePickers';
import { Notice } from '@/components/ui/Notice';
import { SHELL_WIDTH } from '@/components/layout/container';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';

export default function GameCanvas() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const character = useSettings((state) => state.character);
  const biome = useSettings((state) => state.biome);
  const setCharacter = useSettings((state) => state.setCharacter);
  const setBiome = useSettings((state) => state.setBiome);
  // Validated on the way out of the store: persisted preferences are untrusted.
  const stage = useStageSelection();

  const setLastRun = useRunStore((state) => state.setLastRun);

  const { actions, snapshot } = useGameRuntime(
    {
      container: containerRef,
      gameCanvas: gameCanvasRef,
      video: videoRef,
      overlay: overlayRef,
    },
    { character, biome, stage },
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
    <div className="flex min-h-dvh flex-col">
      <SiteHeader hasCta={false} />

      <main className={`mx-auto flex w-full ${SHELL_WIDTH.wide} flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6`}>
        <div
          id="gameStage"
          ref={containerRef}
          /*
           * Portrait at every size. CONFIG.game.camera is framed for a tall
           * viewport -- "far enough back that the outer lanes stay inside a
           * narrow viewport" -- and the old lg:aspect-16/10 fought that framing.
           *
           * The ratio has to be driven by WIDTH, capped so the derived height
           * still fits the viewport. Capping height instead (max-h) lets a short
           * window squash the box back to landscape, which is the bug this
           * screen started with.
           */
          className="relative mx-auto aspect-3/4 w-full max-w-[calc(80vh*3/4)] touch-manipulation overflow-hidden rounded-xl border border-line bg-bg"
        >
          <canvas ref={gameCanvasRef} className="block h-full w-full" />

          <GameHud snapshot={snapshot} />
          <CameraStage
            videoRef={videoRef}
            overlayRef={overlayRef}
            isCameraRunning={snapshot.isCameraRunning}
          />
          <GameOverOverlay
            snapshot={snapshot}
            onRestart={restart}
            onSeeResult={seeResult}
            isSubmitting={isSubmitting}
          />
        </div>

        <ScenePickers
          character={character}
          biome={biome}
          onCharacterChange={setCharacter}
          onBiomeChange={setBiome}
        />

        <p className="m-0 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[13px] text-muted">
          <span className="flex items-center gap-1.5">
            <MoveHorizontal aria-hidden size={15} />
            Step or lean sideways to change lane
          </span>
          <span className="flex items-center gap-1.5">
            <Footprints aria-hidden size={15} />
            Jog in place to attack
          </span>
          <span className="text-subtle">Arrow keys also work</span>
        </p>

        {snapshot.error && <Notice tone="error">{snapshot.error}</Notice>}

        {submitError && (
          <Notice tone="error" title="Your result was not saved">
            {submitError}
          </Notice>
        )}

        <DetectorDebugPanel
          snapshot={snapshot}
          onStartCamera={actions.startCamera}
          onStopCamera={actions.stopCamera}
          onRecalibrate={actions.recalibrate}
        />
      </main>

      <SiteFooter />
    </div>
  );
}
