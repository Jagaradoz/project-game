'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/ui/PageShell';
import { Card } from '@/components/ui/Card';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { Notice } from '@/components/ui/Notice';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { repository, getErrorMessage } from '@/lib/api';
import { useRunStore } from '@/lib/store/run';
import { formatNumber, formatDuration, formatMetres, formatDelta } from '@/lib/format';
import type { ProfileSummary } from '@/types/api';

export default function ResultPage() {
  return <Suspense fallback={<main className="p-8">Preparing run summary…</main>}><ResultContent /></Suspense>;
}
function ResultContent() {
  const selectedId = useSearchParams().get('run');
  const lastRun = useRunStore(s => s.lastRun);
  const [profile, setProfile] = useState<ProfileSummary | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    repository.getProfile().then(p => { if (active) setProfile(p); }).catch(e => { if (active) setError(getErrorMessage(e)); });
    return () => { active = false; };
  }, [lastRun]);
  const run = selectedId ? profile?.recentRuns.find(r => r.id === selectedId) : lastRun ?? profile?.recentRuns[0];
  const index = profile && run ? profile.recentRuns.findIndex(r => r.id === run.id) : -1;
  const previous = index >= 0 ? profile?.recentRuns[index + 1] : undefined;
  const number = (n: number | null | undefined) => n == null ? '—' : n.toFixed(1);
  const metrics = run?.metrics;
  return <PageShell title="Run summary" subtitle="Results and comparisons from this visit. Reloading clears all history." width="wide">
    {error && <Notice tone="error">{error}</Notice>}
    {!profile && !error ? <p>Preparing your results…</p> : !run ? <EmptyState title="No result in this visit" action={<LinkButton href="/play" variant="primary">Start Game Mode</LinkButton>}>Finish a run to see its summary. Previous visits are never restored.</EmptyState> : <>
      <Notice tone={run.goalReached ? 'ok' : 'info'} title={run.goalReached ? '20-minute goal reached' : 'Session complete'}>Take a break or play again at your own pace.</Notice>
      <Card title="This run"><StatGrid>
        <StatTile label="Score" value={formatNumber(run.score)} isHighlighted />
        <StatTile label="Enemies defeated" value={formatNumber(run.enemiesKilled)} />
        <StatTile label="Gameplay time" value={formatDuration(run.durationMs)} />
        <StatTile label="Time moving" value={formatDuration(run.movementMs)} />
        <StatTile label="Detected knee steps" value={formatNumber(run.stepCount)} />
        <StatTile label="Detected movements" value={formatNumber(run.movementCount)} detail="Counts from detection, not a clinical energy estimate" />
        <StatTile label="Distance" value={formatMetres(run.distanceM)} />
      </StatGrid></Card>
      {profile && <Card title="Compared with your own visit history"><StatGrid>
        <StatTile label="Visit best score" value={formatNumber(profile.stats.bestScore)} />
        <StatTile label="Runs this visit" value={formatNumber(profile.stats.totalRuns)} />
        <StatTile label="Score vs previous run" value={previous ? formatDelta(run.score - previous.score) : '—'} detail={previous ? 'Compared with the immediately earlier run' : 'No earlier run in this visit'} />
        <StatTile label="Knee steps vs previous run" value={previous ? formatDelta(run.stepCount - previous.stepCount) : '—'} />
      </StatGrid></Card>}
      {metrics && <Card title="Technical measurements"><StatGrid>
        <StatTile label="Response mean / P95" value={number(metrics.latencyMeanMs) + ' / ' + number(metrics.latencyP95Ms) + ' ms'} detail={metrics.latencySamples + ' frame-to-render samples · P95 target ≤200 ms'} />
        <StatTile label="Response min / max" value={number(metrics.latencyMinMs) + ' / ' + number(metrics.latencyMaxMs) + ' ms'} />
        <StatTile label="Average render FPS" value={number(metrics.fpsMean)} detail="Target ≥24; this browser and current graphics settings" />
        <StatTile label="First / last minute FPS" value={number(metrics.firstMinuteFps) + ' / ' + number(metrics.lastMinuteFps)} />
        <StatTile label="FPS decline" value={number(metrics.fpsDeclinePercent) + '%'} detail="Target ≤15%; first and final minute" />
        <StatTile label="Body-loss pauses" value={String(metrics.bodyLossIncidents)} detail="Target ≤1 per 20-minute evaluation session" />
      </StatGrid><p className="m-0 text-sm text-muted">Latency ends at render submission, not screen presentation. Full evaluation requires a 20-minute real-webcam trial, observer-scored accuracy, manually counted steps, and observed stability incidents.</p></Card>}
      <div className="flex flex-wrap gap-3"><LinkButton href="/play" variant="primary">Play again</LinkButton><LinkButton href="/profile">Visit history</LinkButton><LinkButton href="/">Home</LinkButton></div>
    </>}
  </PageShell>;
}
