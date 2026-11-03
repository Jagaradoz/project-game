'use client';
import { PageShell } from '@/components/ui/PageShell';
import { Card } from '@/components/ui/Card';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { Notice } from '@/components/ui/Notice';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useRunStore } from '@/lib/store/run';
import { formatNumber, formatDuration, formatMetres } from '@/lib/format';
import type { SaveState } from '@/lib/store/run';
import Link from 'next/link';

const number = (n: number | null | undefined) => n == null ? '—' : n.toFixed(1);

export default function ResultPage() {
  const run = useRunStore(s => s.lastRun);
  const saveState = useRunStore(s => s.saveState), saveError = useRunStore(s => s.saveError);
  const metrics = run?.metrics;
  return <PageShell title="Run summary" subtitle="The run you just finished. Logged-in runs are kept on My stats; this detailed view clears when you leave." width="wide">
    {!run ? <EmptyState title="No run to show" action={<LinkButton href="/play" variant="primary">Start Game Mode</LinkButton>}>Finish a run to see its summary.</EmptyState> : <>
      <Notice tone={run.goalReached ? 'ok' : 'info'} title={run.goalReached ? '20-minute goal reached' : 'Session complete'}>Take a break or play again at your own pace.</Notice>
      <SaveNotice state={saveState} error={saveError} />
      <Card title="This run"><StatGrid>
        <StatTile label="Score" value={formatNumber(run.score)} isHighlighted />
        <StatTile label="Enemies defeated" value={formatNumber(run.enemiesKilled)} />
        <StatTile label="Gameplay time" value={formatDuration(run.durationMs)} />
        <StatTile label="Time moving" value={formatDuration(run.movementMs)} />
        <StatTile label="Detected knee steps" value={formatNumber(run.stepCount)} />
        <StatTile label="Detected movements" value={formatNumber(run.movementCount)} detail="Counts from detection, not a clinical energy estimate" />
        <StatTile label="Distance" value={formatMetres(run.distanceM)} />
      </StatGrid></Card>
      {metrics && <Card title="Technical measurements"><StatGrid>
        <StatTile label="Response mean / P95" value={number(metrics.latencyMeanMs) + ' / ' + number(metrics.latencyP95Ms) + ' ms'} detail={metrics.latencySamples + ' detected moves · P95 target ≤200 ms'} />
        <StatTile label="Response min / max" value={number(metrics.latencyMinMs) + ' / ' + number(metrics.latencyMaxMs) + ' ms'} />
        <StatTile label="Average render FPS" value={number(metrics.fpsMean)} detail="Target ≥24; this browser and current graphics settings" />
        <StatTile label="First / last minute FPS" value={number(metrics.firstMinuteFps) + ' / ' + number(metrics.lastMinuteFps)} />
        <StatTile label="FPS decline" value={number(metrics.fpsDeclinePercent) + '%'} detail="Target ≤15%; first and final minute" />
        <StatTile label="Body-loss pauses" value={String(metrics.bodyLossIncidents)} detail="Target ≤1 per 20-minute evaluation session" />
      </StatGrid><p className="m-0 text-sm text-muted">Latency ends at render submission, not screen presentation. Full evaluation requires a 20-minute real-webcam trial, observer-scored accuracy, manually counted steps, and observed stability incidents.</p></Card>}
      <div className="flex flex-wrap gap-3"><LinkButton href="/play" variant="primary">Play again</LinkButton><LinkButton href="/test">Guide Mode</LinkButton><LinkButton href="/">Home</LinkButton></div>
    </>}
  </PageShell>;
}

/** Whether this run reached the player's saved stats. */
function SaveNotice({ state, error }: { state: SaveState; error: string | null }) {
  const link = 'font-bold underline decoration-2 underline-offset-4';
  if (state === 'saved') return <Notice tone="ok" title="Run saved">Score, distance and time were added to <Link href="/stats" className={link}>My stats</Link>.</Notice>;
  if (state === 'saving') return <Notice tone="info">Saving this run to your stats…</Notice>;
  if (state === 'guest') return <Notice tone="info" title="Not saved">You are not logged in. <Link href="/login?next=/stats" className={link}>Log in</Link> or <Link href="/register" className={link}>register</Link> to keep your next runs.</Notice>;
  if (state === 'error') return <Notice tone="warn" title="Run not saved">{error ?? 'Something went wrong.'}</Notice>;
  return null;
}
