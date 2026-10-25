'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, MoveHorizontal, LocateFixed } from 'lucide-react';
import { PoseStage } from '@/components/pose/PoseStage';
import { Button, LinkButton } from '@/components/ui/Button';
import { VersionTag } from '@/components/ui/VersionTag';
import type { GameRuntimeRefs, GameActions, HudSnapshot } from '@/hooks/useGameRuntime';
import { MOVEMENTS } from '@/lib/testing/evaluation';
import { practiceCue, POSE_TITLES } from '@/lib/testing/practicePresentation';
import { PoseDemo } from './PoseDemo';
import { DeveloperDiagnostics } from './DeveloperDiagnostics';
import { GuideOverlay } from './GuideOverlay';
import styles from './GuideMode.module.css';

const SESSION_MS = 20 * 60 * 1000;
const LANE_NAMES: Record<HudSnapshot['lateralLabel'], string> = { LEFT: 'Left lane', CENTER: 'Centre lane', RIGHT: 'Right lane' };
type OverlayView = 'measurements' | 'logs' | 'summary' | null;
function clock(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
function actionFor(s: HudSnapshot) {
  if (!s.isCameraRunning) return null;
  if (!s.hasBody || !s.kneesVisible) return { label: 'Find your position', detail: 'Keep your head and knees in view.' };
  if (!s.isCalibrated) return { label: 'Calibrating', detail: 'Stand still in the centre.' };
  return { label: s.isAirborne ? 'Jumping' : s.isHandsOnHips || s.isShielding ? 'Shielding' : s.isJogging ? 'Running' : s.lateralLabel === 'LEFT' ? 'Moving left' : s.lateralLabel === 'RIGHT' ? 'Moving right' : 'Ready', detail: LANE_NAMES[s.lateralLabel] };
}

export function TestModePanel({ runtimeRefs: { container, gameCanvas, video, overlay }, snapshot, actions }: { runtimeRefs: GameRuntimeRefs; snapshot: HudSnapshot; actions: GameActions }) {
  const [view, setView] = useState<OverlayView>(null);
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const p = snapshot.practice;
  const cue = practiceCue(p, snapshot.lateralLabel);
  const CueIcon = cue.direction ? { left: ArrowLeft, right: ArrowRight, up: ArrowUp, down: ArrowDown, apart: MoveHorizontal, centre: LocateFixed }[cue.direction] : null;
  const index = MOVEMENTS.findIndex(m => m.id === p.pose);
  const next = MOVEMENTS[(index + 1) % MOVEMENTS.length];
  const action = actionFor(snapshot);
  const ready = snapshot.canPractice && snapshot.isSceneReady && !snapshot.trial.active;
  const free = p.mode === 'free';
  const isPaused = p.phase === 'paused';
  const ended = p.phase === 'summary';
  const shownView = ended && !summaryDismissed ? 'summary' : view;
  const titles = { measurements: 'Measurements', logs: 'Event log', summary: 'Session summary' };
  const command = actions.practiceCommand;
  function restart() {
    setSummaryDismissed(false);
    setView(null);
    command({ type: 'restart' });
  }
  function close() {
    if (shownView === 'summary') setSummaryDismissed(true);
    setView(null);
  }
  useEffect(() => {
    if (ready && p.mode === 'guided' && p.phase === 'idle' && !p.sessionStarted) command({ type: 'start' });
  }, [ready, p.mode, p.phase, p.sessionStarted, command]);
  const readiness = !snapshot.isCameraRunning ? 'Allow camera access to begin.' : !snapshot.hasBody || !snapshot.kneesVisible ? 'Step back until your head and knees are visible.' : !snapshot.isCalibrated ? 'Stand still in the centre to calibrate.' : !snapshot.isSceneReady ? 'Loading your character…' : snapshot.trial.active ? 'Stop the developer test before starting.' : 'Starting your guide…';
  const phaseText = free ? 'Move at your own pace' : p.phase === 'rest' ? `Rest · ${Math.ceil(p.remainingPhaseMs / 1000)}s` : p.phase === 'complete' ? `Pose complete · next in ${Math.ceil(p.remainingPhaseMs / 1000)}s` : isPaused ? 'Session paused' : ended ? 'Session finished' : p.sessionStarted ? `Pose ${index + 1} of 4` : 'Get ready';
  return <main className={styles.screen} aria-label="Guide Mode">
    <div className={styles.header}>
      <h1>Guide Mode</h1><span className={styles.sessionLabel}>{free ? 'Free practice' : '20-minute guided session'}</span>
      <span className={styles.time} aria-label={`${clock(SESSION_MS - p.elapsedMs)} remaining`}>{clock(SESSION_MS - p.elapsedMs)}</span><span className={styles.round}>Round {p.round}</span>
    </div>
    <div className={styles.progress} role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={20} aria-valuenow={Math.min(20, Math.floor(p.elapsedMs / 60000))}><span style={{ width: `${Math.min(100, p.elapsedMs / SESSION_MS * 100)}%` }} /></div>
    <div className={styles.grid} data-testid="test-mode-grid">
      <section aria-label="Camera and skeleton" className={`${styles.panel} ${styles.camera}`}>
        <PoseStage videoRef={video} overlayRef={overlay} isCameraRunning={snapshot.isCameraRunning} aspect="portrait" idleLabel="Waiting for camera permission…" />
        <h2 className={styles.label}>Camera + skeleton</h2>
        {!snapshot.isCameraRunning && snapshot.error && <div className={`${styles.panelMessage} ${styles.cameraMessage}`}><p>{snapshot.error}</p><p>Allow camera access to see your body and skeleton.</p><Button size="sm" onClick={actions.startCamera}>Allow camera</Button></div>}
        {snapshot.isCameraRunning && !snapshot.canPractice && <div className={`${styles.trackingMessage} ${styles.cameraMessage}`}><p role="status">{readiness}</p>{snapshot.error && <p role="alert">{snapshot.error}</p>}</div>}
      </section>
      <section ref={container} aria-label="Character response" className={`${styles.panel} ${styles.character}`}>
        <canvas ref={gameCanvas} className={styles.canvas} aria-label="Animated game character responding to detected movements" />
        <h2 className={styles.label}>Character response</h2>
        {!snapshot.isSceneReady && <div className={styles.panelMessage}><p role="status">{snapshot.error || 'Loading character…'}</p></div>}
        {snapshot.isSceneReady && action && <div className={styles.response}><strong>{action.label}</strong><span>{action.detail}</span></div>}
      </section>
      <section aria-label="Practice guide" className={`${styles.panel} ${styles.guide}`}>
        <h2 className={styles.label}>Visual guidance</h2>
        <div className={styles.art}><PoseDemo pose={p.pose} /></div>
        <div className={styles.guideCopy}>
          <div className={styles.cueMeta}><span className={styles.poseName}>{POSE_TITLES[p.pose]}</span><span className={styles.eyebrow}>{phaseText}</span></div>
          <h2 className={styles.cueTitle} role="status" aria-live="polite" aria-atomic="true">{CueIcon && <CueIcon className={styles.cueIcon} aria-hidden />}<span>{cue.title}</span></h2>
          <p className={styles.cueDetail}>{cue.detail}</p>
          {!free && <><div className={styles.count}>{p.count} <small>/ {p.goal} reps</small></div><progress className={styles.repProgress} aria-label="Successful repetitions" value={p.count} max={p.goal} /></>}
          {isPaused && !free && <Button size="sm" disabled={!ready} onClick={() => command({ type: 'resume' })}>Resume</Button>}
          <div className={styles.next}><span>Next</span><strong>{p.phase === 'rest' ? POSE_TITLES.lateral : index === MOVEMENTS.length - 1 ? '20-second rest' : POSE_TITLES[next.id]}</strong></div>
        </div>
      </section>
    </div>
    <div className={styles.dock} role="group" aria-label="Guide controls">
      <Button size="sm" variant="secondary" onClick={() => setView('measurements')}>Measurements</Button>
      <Button size="sm" variant="secondary" onClick={() => setView('logs')}>Event log <span className="sr-only">{snapshot.diagnostics.events.length} events</span></Button>
    </div>
    {shownView && <GuideOverlay key={shownView} title={titles[shownView]} onClose={close}>
      {(shownView === 'measurements' || shownView === 'logs') && <DeveloperDiagnostics view={shownView} snapshot={snapshot} actions={actions} />}
      {shownView === 'measurements' && <VersionTag />}
      {shownView === 'summary' && <div className={styles.options}>
        <p>{p.finishReason === 'time' ? 'Your 20-minute guided session is complete.' : 'You finished this guided session early.'}</p>
        <dl className={styles.summary}><div><dt>Session time</dt><dd>{clock(p.elapsedMs)}</dd></div><div><dt>Completed rounds</dt><dd>{p.completedRounds}</dd></div><div><dt>Successful repetitions</dt><dd>{MOVEMENTS.reduce((total, m) => total + p.totals[m.id], 0)}</dd></div><div><dt>Skipped poses</dt><dd>{p.skips}</dd></div></dl>
        <dl className="m-0 grid gap-2 text-sm">{MOVEMENTS.map(m => <div key={m.id} className="flex justify-between gap-4 border-b border-ink/20 pb-2"><dt>{m.title}</dt><dd className="m-0 font-bold">{p.totals[m.id]} reps</dd></div>)}</dl>
        {p.unfinishedPose && <p>Unfinished pose: {MOVEMENTS.find(m => m.id === p.unfinishedPose)?.title}. Counted repetitions are included.</p>}
        <div className={styles.row}><Button size="sm" onClick={restart}>Restart session</Button><LinkButton href="/play" size="sm">Game Mode</LinkButton><LinkButton href="/" size="sm">Home</LinkButton></div><Button size="sm" variant="secondary" onClick={() => { setSummaryDismissed(true); setView('logs'); }}>Review event log</Button>
      </div>}
    </GuideOverlay>}
  </main>;
}
