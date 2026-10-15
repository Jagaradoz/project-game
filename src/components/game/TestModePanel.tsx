'use client';
import { PoseStage } from '@/components/pose/PoseStage';
import { Button } from '@/components/ui/Button';
import { MOVEMENTS } from '@/lib/testing/evaluation';
import type { GameRuntimeRefs, GameActions, HudSnapshot } from '@/hooks/useGameRuntime';

export function TestModePanel({ runtimeRefs: { container: containerRef, gameCanvas: gameCanvasRef, video: videoRef, overlay: overlayRef }, snapshot, actions }: { runtimeRefs: GameRuntimeRefs; snapshot: HudSnapshot; actions: GameActions }) {
  const movementId = snapshot.isAirborne ? 'clap' : snapshot.isHandsOnHips ? 'hips' : snapshot.isJogging ? 'knees'
    : snapshot.lateralLabel !== 'CENTER' ? 'lateral' : null;
  const movement = MOVEMENTS.find(m => m.id === movementId);
  const detected = !snapshot.isCameraRunning ? null : !snapshot.hasBody ? 'Body not detected'
    : !snapshot.isCalibrated ? 'Calibrating centre' : snapshot.isAirborne ? 'Overhead clap · jump'
      : [snapshot.lateralLabel !== 'CENTER' ? snapshot.lateralLabel : '', snapshot.isJogging ? 'Knee lifts · attack' : '',
        snapshot.isHandsOnHips ? 'Hands on hips · shield' : ''].filter(Boolean).join(' + ') || 'Standing still · centre';
  const number = (value: number | null, digits = 1) => value === null ? '0' : value.toFixed(digits);
  const metrics = snapshot.metrics;
  const readings = [
    ['Latency · mean / P95', number(metrics.latencyMeanMs) + ' / ' + number(metrics.latencyP95Ms) + ' ms'],
    ['FPS · pose / render', number(snapshot.poseFps, 0) + ' / ' + number(snapshot.renderFps, 0)],
    ['Processing / frame', number(snapshot.processingMs) + ' ms'],
    ['Knee cadence', Math.round(snapshot.isJogging ? snapshot.cadenceSpm : 0) + ' steps/min'],
    ['Character speed', snapshot.speed.toFixed(2) + ' m/s'],
    ['Detections · knees / lanes / hips / claps', [snapshot.stepCount, snapshot.lateralChangeCount, snapshot.hipsHoldCount, snapshot.clapCount].join(' / ')],
  ];
  const portraitWidth = { width: 'min(calc(50cqw - 8px), 56.25cqh)' };
  return <main className="grid h-dvh w-full grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden p-3 sm:p-4">
      <h1 className="sr-only">Test Mode</h1>
      <div data-testid="test-mode-grid" className="flex min-h-0 items-center justify-center gap-4" style={{ containerType: 'size' }}>
        <section aria-label="Camera and skeleton" style={portraitWidth} className="relative aspect-9/16 flex-none overflow-hidden border-2 border-ink bg-black">
          <PoseStage videoRef={videoRef} overlayRef={overlayRef} isCameraRunning={snapshot.isCameraRunning} aspect="portrait" idleLabel="Waiting for camera permission…" />
          {!snapshot.isCameraRunning && snapshot.error && <div className="absolute inset-0 grid place-content-center gap-4 bg-black px-6 text-center">
            <p className="m-0 text-sm text-white">Allow camera access to see your body and skeleton.</p>
            <Button size="sm" onClick={actions.startCamera}>Allow camera</Button>
          </div>}
          <h2 className="pointer-events-none absolute inset-x-0 top-0 m-0 bg-black/70 px-3 py-2 text-sm font-bold text-white">Camera + skeleton</h2>
        </section>
        <section ref={containerRef} aria-label="Character response" style={portraitWidth} className="relative aspect-9/16 flex-none overflow-hidden border-2 border-ink bg-primary-soft">
          <canvas ref={gameCanvasRef} className="absolute inset-0 h-full w-full" aria-label="Animated game character responding to detected movements" />
          <h2 className="pointer-events-none absolute inset-x-0 top-0 m-0 bg-surface/90 px-3 py-2 text-sm font-bold">Character response</h2>
          {!snapshot.isSceneReady && <p className="absolute inset-0 m-0 grid place-content-center p-4 text-center text-sm">{snapshot.error || 'Loading character…'}</p>}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-surface/95 px-3 py-2">
            {detected && <p role="status" className="m-0 text-sm font-black text-accent-text">{detected}</p>}
            <p className="mt-1 mb-0 text-xs leading-relaxed">{snapshot.hasBody && snapshot.isCalibrated && movement
              ? movement.effect : snapshot.isCameraRunning ? 'Stand where the camera can see your head and knees.' : 'Your movements will drive the character automatically.'}</p>
          </div>
        </section>
      </div>
      <section aria-label="Live measurements" className="mx-auto w-full max-w-6xl border-t-2 border-ink pt-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-bold">Live measurements</h2>
        </div>
        <dl className="m-0 grid grid-cols-3 gap-x-4 gap-y-2 lg:grid-cols-6">
          {readings.map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="m-0 text-sm font-bold tabular-nums">{value}</dd></div>)}
        </dl>
      </section>
    </main>;
}

