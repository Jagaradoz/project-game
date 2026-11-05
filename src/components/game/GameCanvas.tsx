'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useGameRuntime } from '@/hooks/useGameRuntime';
import type { RuntimeMode } from '@/engine/runtime';
import { useFakeBody, usePlayDebugTools } from '@/hooks/usePlayDebugTools';
import { useRunStore } from '@/lib/store/run';
import { useSettings } from '@/lib/store/settings';
import { CameraStage } from '@/components/game/CameraStage';
import { GameHud } from '@/components/game/GameHud';
import { GameOverOverlay } from '@/components/game/GameOverOverlay';
import { GameSetupOverlay } from '@/components/game/GameSetupOverlay';
import { PausedCard } from '@/components/game/PausedCard';
import CalibrationPanel from '@/components/game/CalibrationPanel';
import { TestModePanel } from '@/components/game/TestModePanel';
import { PoseStage } from '@/components/pose/PoseStage';
import { PageShell } from '@/components/ui/PageShell';
import { Button } from '@/components/ui/Button';

/** Sole runtime owner in React. Setup and gameplay keep the same mounted DOM nodes. */
export default function GameCanvas({ mode = 'game' }: { mode?: RuntimeMode }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null), gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null), overlayRef = useRef<HTMLCanvasElement>(null);
  const refs = { container: containerRef, gameCanvas: gameCanvasRef, video: videoRef, overlay: overlayRef };
  const character = useSettings(s => s.character), graphicsQuality = useSettings(s => s.graphicsQuality);
  const hideCamera = useSettings(s => s.hideCamera), setHideCamera = useSettings(s => s.setHideCamera);
  const startingDifficulty = useSettings(s => s.startingDifficulty);
  const fakeBody = useFakeBody();
  const { snapshot, actions } = useGameRuntime(refs, { mode, character, graphicsQuality, fakeBody });
  const showDebugTools = usePlayDebugTools();
  const setLastRun = useRunStore(s => s.setLastRun);
  const handedOff = useRef(false);
  useEffect(() => {
    if (mode !== 'test') return;
    let cancelled = false;
    // Defer one microtask so Strict Mode's discarded mount never prompts twice.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      void actions.startCamera();
    });
    return () => { cancelled = true; };
  }, [mode, actions]);
  useEffect(() => {
    if (mode === 'game' && !snapshot.hasStarted && snapshot.canBegin && snapshot.isSceneReady) actions.beginRun(startingDifficulty);
  }, [mode, snapshot.hasStarted, snapshot.canBegin, snapshot.isSceneReady, actions, startingDifficulty]);
  /** Hands the finished run to /result. Held in memory for this page view only. */
  const seeResult = () => {
    const summary = actions.getRunSummary();
    if (summary) setLastRun(summary);
    router.push('/result');
  };
  useEffect(() => {
    if (mode !== 'game' || !snapshot.isOver || handedOff.current) return;
    handedOff.current = true;
    const summary = actions.getRunSummary();
    if (summary) setLastRun(summary);
  }, [mode, snapshot.isOver, actions, setLastRun]);
  const restart = () => { handedOff.current = false; actions.restart(); };

  if (mode === 'test') return <TestModePanel runtimeRefs={refs} snapshot={snapshot} actions={actions} />;
  if (mode === 'pose') return <PageShell title="Camera calibration" heading={false} width="wide">
    <div ref={containerRef} className="grid gap-6 md:grid-cols-2">
      <div><canvas ref={gameCanvasRef} hidden aria-hidden /><PoseStage videoRef={videoRef} overlayRef={overlayRef} isCameraRunning={snapshot.isCameraRunning} /></div>
      <CalibrationPanel snapshot={snapshot} actions={actions} />
    </div>
  </PageShell>;

  const setup = !snapshot.hasStarted;
  const isBodyLost = snapshot.pauseReason === 'body' && snapshot.isCameraRunning;
  const pauseText = snapshot.pauseReason === 'body' ? 'Your body is no longer tracked. Step back into frame with both knees visible.'
    : snapshot.pauseReason === 'camera' ? 'Camera tracking stopped. Allow the camera again before resuming.'
      : snapshot.pauseReason === 'hidden' ? 'The page was hidden. Check your position, then resume when ready.' : 'Take a break. Resume when you are ready.';
  return <main className="play-screen" aria-label="Game Mode">
    <div id="gameStage" ref={containerRef} className="play-stage">
      <canvas ref={gameCanvasRef} className="block h-full w-full" />
      {!setup && <GameHud snapshot={snapshot} />}
      <CameraStage videoRef={videoRef} overlayRef={overlayRef} isCameraRunning={snapshot.isCameraRunning}
        isCameraSkipped={snapshot.isCameraSkipped} isCameraHidden={hideCamera} isSetup={setup} />
      {setup && <GameSetupOverlay snapshot={snapshot} actions={actions} canSkipCamera={showDebugTools && process.env.NODE_ENV !== 'production'} />}
      {!setup && !snapshot.isOver && <div className="absolute top-3 left-3 z-20 flex max-w-[calc(100%_-_120px)] flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={actions.pause} disabled={snapshot.pauseReason !== null}>Pause</Button>
        <Button size="sm" variant="secondary" onClick={() => { actions.finish(); seeResult(); }}>Finish session</Button>
        <Button size="sm" variant="secondary" onClick={() => setHideCamera(!hideCamera)}>{hideCamera ? 'Show camera' : 'Hide camera'}</Button>
      </div>}
      {isBodyLost && !snapshot.isOver && <section className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/40 p-6" aria-label="Game paused">
        <PausedCard detail="Step back into frame. The game continues when your full body is visible." />
      </section>}
      {snapshot.pauseReason !== null && !isBodyLost && !snapshot.isOver && <section className="absolute inset-0 z-30 grid place-content-center bg-black/70 p-6" aria-label="Game paused">
        <div className="flex max-w-md flex-col gap-4 border-2 border-ink bg-surface p-6">
          <h2 className="m-0 text-2xl font-black">Game paused</h2><p className="m-0">{pauseText}</p>
          {!snapshot.isCameraRunning && !snapshot.isCameraSkipped && <Button onClick={actions.startCamera}>Allow camera again</Button>}
          {snapshot.error && <p role="alert" className="m-0 text-danger-text">{snapshot.error}</p>}
          <Button onClick={actions.resume} disabled={!snapshot.isCameraSkipped && (!snapshot.isCameraRunning || !snapshot.hasBody || !snapshot.isCalibrated || !snapshot.kneesVisible)}>Resume</Button>
          <Button variant="secondary" onClick={() => { actions.finish(); seeResult(); }}>Finish session</Button>
        </div>
      </section>}
      <GameOverOverlay snapshot={snapshot} onRestart={restart} onSeeResult={seeResult} />
      {fakeBody && <p className="pointer-events-none absolute inset-x-3 top-16 z-40 m-0 bg-ink/85 px-2 py-1 text-center font-mono text-[10px] text-white">Fake body: B body · N knees · Q/E lean · G jog · 1/2/3 speed · H hips · C clap</p>}
    </div>
  </main>;
}
