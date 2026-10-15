'use client';
import { PoseStage } from '@/components/pose/PoseStage';
import { Button } from '@/components/ui/Button';
import { CONFIG } from '@/engine/config';
import { MOVEMENTS, trialResult } from '@/lib/testing/evaluation';
import type { ActiveTrial, TrialTally } from '@/engine/core/trial';
import type { LatencySummary } from '@/engine/core/metrics';
import type { GameRuntimeRefs, GameActions, HudSnapshot } from '@/hooks/useGameRuntime';

const PROMPTS: Record<string, string> = {
  LEFT: 'Lean left', RIGHT: 'Lean right', CENTER: 'Back to centre',
  LEFT_KNEE: 'Lift your left knee', RIGHT_KNEE: 'Lift your right knee',
  hips: 'Hands on hips', clap: 'Clap overhead',
};

function promptFor(trial: ActiveTrial): string {
  if (trial.phase === 'rest') return 'Relax…';
  if (trial.phase === 'ready') return trial.pose === 'knees' ? 'Lift either knee to begin' : 'Lower your hands';
  return PROMPTS[trial.target ?? trial.pose] ?? '';
}

function formatLatency(latency: LatencySummary): string {
  return latency.samples ? `${latency.meanMs!.toFixed(0)} / ${latency.p95Ms!.toFixed(0)} ms` : '—';
}

function formatError(tally: TrialTally | null): string {
  if (!tally) return '—';
  const { attempts, errorPercent, isComplete, passes } = trialResult(tally);
  if (errorPercent === null) return `0 / ${CONFIG.trial.attempts}`;
  const verdict = isComplete ? (passes ? ' · pass' : ' · fail') : ` · ${attempts} / ${CONFIG.trial.attempts}`;
  return `${errorPercent.toFixed(0)}%${verdict}`;
}

export function TestModePanel({ runtimeRefs: { container: containerRef, gameCanvas: gameCanvasRef, video: videoRef, overlay: overlayRef }, snapshot, actions }: { runtimeRefs: GameRuntimeRefs; snapshot: HudSnapshot; actions: GameActions }) {
  const movementId = snapshot.isAirborne ? 'clap' : snapshot.isHandsOnHips ? 'hips' : snapshot.isJogging ? 'knees'
    : snapshot.lateralLabel !== 'CENTER' ? 'lateral' : null;
  const movement = MOVEMENTS.find(m => m.id === movementId);
  const detected = !snapshot.isCameraRunning ? null : !snapshot.hasBody ? 'Body not detected'
    : !snapshot.isCalibrated ? 'Calibrating centre' : snapshot.isAirborne ? 'Overhead clap · jump'
      : [snapshot.lateralLabel !== 'CENTER' ? snapshot.lateralLabel : '', snapshot.isJogging ? 'Knee lifts · attack' : '',
        snapshot.isHandsOnHips ? 'Hands on hips · shield' : ''].filter(Boolean).join(' + ') || 'Standing still · centre';
  const active = snapshot.trial.active;
  const activeTitle = MOVEMENTS.find(m => m.id === active?.pose)?.title;
  const canTest = snapshot.isCameraRunning && snapshot.hasBody && snapshot.isCalibrated;
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
            {active ? <>
              <p className="m-0 text-xs text-muted">{activeTitle} · attempt {Math.min(CONFIG.trial.attempts, trialResult(active.tally).attempts + 1)} / {CONFIG.trial.attempts}</p>
              <p role="status" className="m-0 text-lg font-black text-accent-text">{promptFor(active)}</p>
            </> : <>
              {detected && <p role="status" className="m-0 text-sm font-black text-accent-text">{detected}</p>}
              <p className="mt-1 mb-0 text-xs leading-relaxed">{snapshot.hasBody && snapshot.isCalibrated && movement
                ? movement.effect : snapshot.isCameraRunning ? 'Stand where the camera can see your head and knees.' : 'Your movements will drive the character automatically.'}</p>
            </>}
          </div>
        </section>
      </div>
      <section aria-label="Live measurements" className="mx-auto w-full max-w-6xl border-t-2 border-ink pt-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-lg font-bold">Measurements</h2>
          <p className="m-0 text-sm">Character speed <span className="font-bold tabular-nums">{snapshot.speed.toFixed(2)} m/s</span></p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted"><tr>
            <th className="py-1 font-normal">Pose</th>
            <th className="py-1 font-normal">Latency · mean / P95</th>
            <th className="py-1 font-normal">Error rate</th>
            <th className="py-1"><span className="sr-only">Test</span></th>
          </tr></thead>
          <tbody>
            {MOVEMENTS.map(m => <tr key={m.id} className="border-t border-ink/20">
              <td className="py-1">{m.title}</td>
              <td className="py-1 font-bold tabular-nums">{formatLatency(snapshot.metrics.latencyByPose[m.id])}</td>
              <td className="py-1 font-bold tabular-nums">{formatError(snapshot.trial.results[m.id])}</td>
              <td className="py-1 text-right">{active?.pose === m.id
                ? <Button size="sm" variant="secondary" onClick={actions.stopTrial}>Stop</Button>
                : <Button size="sm" disabled={!canTest || active !== null} onClick={() => actions.startTrial(m.id)}>Test ×{CONFIG.trial.attempts}</Button>}</td>
            </tr>)}
          </tbody>
        </table>
      </section>
    </main>;
}
