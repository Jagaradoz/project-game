'use client';

/**
 * The entire React <-> engine boundary.
 *
 * This component owns the four DOM nodes the engine needs, creates the runtime
 * in an effect, and disposes it on unmount. Nothing else in the app touches the
 * engine, and the engine touches no React.
 */

import { useRouter } from 'next/navigation';
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
import { VersionTag } from '@/components/ui/VersionTag';

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
   * requires ป้องกันการบันทึกคะแนนซ้ำ, and this screen can submit twice --
   * once automatically, once if the player presses "ดูสรุปผล".
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
    <main className="mx-auto flex max-w-[720px] flex-col gap-3 p-3">
      <div
        ref={containerRef}
        className="relative mx-auto aspect-3/4 max-h-[78vh] w-full overflow-hidden rounded-xl bg-bg touch-manipulation"
      >
        <canvas ref={gameCanvasRef} className="block h-full w-full" />

        <GameHud snapshot={snapshot} />
        <CameraStage
          videoRef={videoRef}
          overlayRef={overlayRef}
          isCameraRunning={snapshot.isCameraRunning}
        />
        <ScenePickers
          character={character}
          biome={biome}
          onCharacterChange={setCharacter}
          onBiomeChange={setBiome}
        />
        <GameOverOverlay
          snapshot={snapshot}
          onRestart={restart}
          onSeeResult={seeResult}
          isSubmitting={isSubmitting}
        />
      </div>

      <p className="m-0 text-center text-[13px] text-muted">
        ก้าวหรือเอียงตัวซ้าย-ขวาเพื่อเปลี่ยนเลน &middot; วิ่งอยู่กับที่เพื่อยิง (ปุ่มลูกศรใช้ได้เช่นกัน)
      </p>

      {snapshot.error && (
        <p role="alert" className="m-0 rounded-lg bg-[#3a1c1c] px-3 py-2.5 text-sm text-[#ffb4b4]">
          {snapshot.error}
        </p>
      )}

      {submitError && (
        <p role="alert" className="m-0 rounded-lg bg-[#3a1c1c] px-3 py-2.5 text-sm text-[#ffb4b4]">
          บันทึกผลไม่สำเร็จ: {submitError}
        </p>
      )}

      <DetectorDebugPanel
        snapshot={snapshot}
        onStartCamera={actions.startCamera}
        onStopCamera={actions.stopCamera}
        onRecalibrate={actions.recalibrate}
      />

      <VersionTag />
    </main>
  );
}
