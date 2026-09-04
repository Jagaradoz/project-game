'use client';

/**
 * The entire React <-> engine boundary.
 *
 * This component owns the four DOM nodes the engine needs, creates the runtime
 * in an effect, and disposes it on unmount. Nothing else in the app touches the
 * engine, and the engine touches no React.
 */

import { useEffect, useRef } from 'react';

import { useGameRuntime } from '@/hooks/useGameRuntime';
import { useSettings } from '@/lib/store/settings';
import { CameraStage } from '@/components/game/CameraStage';
import { DetectorDebugPanel } from '@/components/game/DetectorDebugPanel';
import { GameHud } from '@/components/game/GameHud';
import { GameOverOverlay } from '@/components/game/GameOverOverlay';
import { ScenePickers } from '@/components/game/ScenePickers';
import { VersionTag } from '@/components/ui/VersionTag';

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const character = useSettings((state) => state.character);
  const biome = useSettings((state) => state.biome);
  const setCharacter = useSettings((state) => state.setCharacter);
  const setBiome = useSettings((state) => state.setBiome);

  const { actions, snapshot } = useGameRuntime(
    {
      container: containerRef,
      gameCanvas: gameCanvasRef,
      video: videoRef,
      overlay: overlayRef,
    },
    { character, biome },
  );

  // R or Space restarts once the run is over. Registered here rather than in the
  // engine because it is a UI affordance, not a control input.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!snapshot.isOver) return;
      if (event.key === 'r' || event.key === 'R' || event.key === ' ') {
        event.preventDefault();
        actions.restart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, snapshot.isOver]);

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
        <GameOverOverlay snapshot={snapshot} onRestart={actions.restart} />
      </div>

      <p className="m-0 text-center text-[13px] text-muted">
        Lean left / right to switch lane &middot; jog in place to fire. Arrow keys work too.
      </p>

      {snapshot.error && (
        <p role="alert" className="m-0 rounded-lg bg-[#3a1c1c] px-3 py-2.5 text-sm text-[#ffb4b4]">
          {snapshot.error}
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
