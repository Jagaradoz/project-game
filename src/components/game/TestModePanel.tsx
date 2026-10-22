'use client';
import { PoseStage } from '@/components/pose/PoseStage';
import { Button } from '@/components/ui/Button';
import type { GameRuntimeRefs, GameActions, HudSnapshot } from '@/hooks/useGameRuntime';
import { PracticeGuide, PracticeOverview } from './PracticeGuide';
import { DeveloperDiagnostics } from './DeveloperDiagnostics';

const LANE_NAMES: Record<HudSnapshot['lateralLabel'], string> = { LEFT: 'Left lane', CENTER: 'Centre lane', RIGHT: 'Right lane' };
function actionFor(s: HudSnapshot) {
  if (!s.isCameraRunning) return null;
  if (!s.hasBody) return { label: 'Find your position', detail: 'Keep your head and knees in view.' };
  if (!s.isCalibrated) return { label: 'Calibrating', detail: 'Stand still in the centre.' };
  return { label: s.isAirborne ? 'Jumping' : s.isHandsOnHips || s.isShielding ? 'Shielding' : s.isJogging ? 'Running' : s.lateralLabel === 'LEFT' ? 'Moving left' : s.lateralLabel === 'RIGHT' ? 'Moving right' : 'Ready', detail: LANE_NAMES[s.lateralLabel] };
}

export function TestModePanel({ runtimeRefs: { container, gameCanvas, video, overlay }, snapshot, actions }: { runtimeRefs: GameRuntimeRefs; snapshot: HudSnapshot; actions: GameActions }) {
  const action = actionFor(snapshot);
  return <main className="mx-auto min-h-dvh w-full max-w-[1600px] p-4 sm:p-6">
    <PracticeOverview snapshot={snapshot} actions={actions} />
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <PracticeGuide snapshot={snapshot} actions={actions} />
      <div className="min-w-0 xl:sticky xl:top-6">
        <div data-testid="test-mode-grid" className="mx-auto grid max-w-[760px] grid-cols-1 items-start gap-4 md:grid-cols-2">
          <section aria-label="Camera and skeleton" className="relative mx-auto aspect-9/16 w-full max-w-[360px] overflow-hidden border-2 border-ink bg-black md:max-w-[min(360px,max(200px,calc(56.25dvh-135px)))]">
            <PoseStage videoRef={video} overlayRef={overlay} isCameraRunning={snapshot.isCameraRunning} aspect="portrait" idleLabel="Waiting for camera permission…" />
            {!snapshot.isCameraRunning && snapshot.error && <div className="absolute inset-0 grid place-content-center gap-4 bg-black px-6 text-center"><p className="m-0 text-sm text-white">Allow camera access to see your body and skeleton.</p><Button size="sm" onClick={actions.startCamera}>Allow camera</Button></div>}
            <h2 className="pointer-events-none absolute inset-x-0 top-0 m-0 bg-black/70 px-3 py-2 text-sm font-bold text-white">Camera + skeleton</h2>
          </section>
          <section ref={container} aria-label="Character response" className="relative mx-auto aspect-9/16 w-full max-w-[360px] overflow-hidden border-2 border-ink bg-primary-soft md:max-w-[min(360px,max(200px,calc(56.25dvh-135px)))]">
            <canvas ref={gameCanvas} className="absolute inset-0 h-full w-full" aria-label="Animated game character responding to detected movements" />
            <h2 className="pointer-events-none absolute inset-x-0 top-0 m-0 bg-surface/90 px-3 py-2 text-sm font-bold">Character response</h2>
            {!snapshot.isSceneReady && <p className="absolute inset-0 m-0 grid place-content-center p-4 text-center text-sm">{snapshot.error || 'Loading character…'}</p>}
            {snapshot.isSceneReady && action && <div className="pointer-events-none absolute inset-x-0 top-12 grid justify-items-center gap-1 px-3 text-center"><p className="m-0 text-2xl font-black uppercase leading-none tracking-tight text-ink [text-shadow:0_2px_0_var(--color-surface)]">{action.label}</p><p className="m-0 text-xs font-bold text-muted">{action.detail}</p></div>}
          </section>
        </div>
        <p className="mx-auto mb-0 mt-3 max-w-[760px] text-sm text-muted">Your camera shows the movement. Your character shows what it does in the game.</p>
      </div>
    </div>
    <DeveloperDiagnostics snapshot={snapshot} actions={actions} />
  </main>;
}
