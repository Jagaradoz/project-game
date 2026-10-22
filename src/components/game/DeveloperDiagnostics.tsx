'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CONFIG } from '@/engine/config';
import { DIAGNOSTIC_CATEGORIES } from '@/engine/core/diagnostics';
import type { ActiveTrial } from '@/engine/core/trial';
import { MOVEMENTS, trialResult } from '@/lib/testing/evaluation';
import type { GameActions, HudSnapshot } from '@/hooks/useGameRuntime';
import { version } from '../../../package.json';

const PROMPTS: Record<string, string> = { LEFT: 'Lean left', RIGHT: 'Lean right', CENTER: 'Back to centre', LEFT_KNEE: 'Lift your left knee', RIGHT_KNEE: 'Lift your right knee', hips: 'Hands on hips', clap: 'Clap overhead' };
function trialPrompt(trial: ActiveTrial) {
  return trial.phase === 'rest' ? 'Relax…' : trial.phase === 'ready' ? trial.pose === 'knees' ? 'Lift either knee to begin' : 'Lower your hands' : PROMPTS[trial.target ?? trial.pose];
}
function number(value: number | null, suffix = '') { return value === null ? '—' : `${value.toFixed(0)}${suffix}`; }

export function DeveloperDiagnostics({ snapshot, actions }: { snapshot: HudSnapshot; actions: GameActions }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const active = snapshot.trial.active;
  const logs = open ? snapshot.diagnostics.events.filter(e => filter === 'all' || e.category === filter) : [];
  function download() {
    const report = actions.getDiagnosticReport(version);
    if (!report) { setDownloadError('Diagnostics are not ready. Try again.'); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `test-mode-${report.exportedAt.replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setDownloadError(null);
  }
  return <details onToggle={e => setOpen(e.currentTarget.open)} className="mt-6 border-t-2 border-ink pt-4" data-testid="developer-diagnostics">
    <summary className="cursor-pointer text-sm font-bold">Developer diagnostics <span className="font-normal text-muted">· measurements, timed evaluation & logs</span></summary>
    {open && <div className="mt-4 space-y-5">
      <section aria-label="Live measurements">
        <h2 className="mb-3 mt-0 text-lg font-bold">Measurements</h2>
        <dl className="m-0 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Pose FPS', number(snapshot.poseFps)], ['Render FPS', number(snapshot.renderFps)],
            ['Processing', number(snapshot.processingMs, ' ms')], ['Inference', number(snapshot.inferenceMs, ' ms')],
            ['Latency mean / P95', `${number(snapshot.metrics.latencyMeanMs)} / ${number(snapshot.metrics.latencyP95Ms)} ms`], ['Character speed', `${snapshot.speed.toFixed(2)} m/s`],
          ].map(([label, value]) => <div key={label} className="border border-ink/20 p-3"><dt className="text-xs text-muted">{label}</dt><dd className="m-0 mt-1 font-bold tabular-nums">{value}</dd></div>)}
        </dl>
        <p className="text-xs text-muted">Model {snapshot.poseModel ?? '—'} · Delegate {snapshot.delegate ?? '—'} · Camera {snapshot.cameraLabel ?? '—'}</p>
      </section>
      <section aria-label="Timed evaluation">
        <h2 className="mb-1 mt-0 text-lg font-bold">Timed evaluation · 10 attempts per pose</h2>
        <p className="mb-3 mt-0 text-sm text-muted">These tests score prompted attempts. Guided practice counts successful repetitions separately. Starting a timed test pauses guided practice.</p>
        {active && <p role="status" className="border-l-4 border-primary bg-primary-soft p-3 font-bold">{MOVEMENTS.find(m => m.id === active.pose)?.title} · Attempt {Math.min(CONFIG.trial.attempts, trialResult(active.tally).attempts + 1)} / {CONFIG.trial.attempts} · {trialPrompt(active)}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-xs text-muted"><th className="py-2 pr-3">Pose</th><th className="py-2 pr-3">Latency mean / P95</th><th className="py-2 pr-3">Timed trial errors</th><th className="py-2"><span className="sr-only">Evaluation controls</span></th></tr></thead>
            <tbody>{MOVEMENTS.map(m => {
              const latency = snapshot.metrics.latencyByPose[m.id];
              const tally = snapshot.trial.results[m.id];
              const result = tally ? trialResult(tally) : null;
              return <tr key={m.id} className="border-t border-ink/20"><td className="py-2 pr-3">{m.title}</td><td className="whitespace-nowrap py-2 pr-3 font-bold tabular-nums">{latency.samples ? `${number(latency.meanMs)} / ${number(latency.p95Ms)} ms` : '—'}</td><td className="py-2 pr-3 tabular-nums">{result ? `${number(result.errorPercent, '%')} · ${result.attempts}/10${result.isComplete ? result.passes ? ' · pass' : ' · fail' : ''}` : '—'}</td><td className="py-2 text-right">{active?.pose === m.id ? <Button size="sm" variant="secondary" onClick={actions.stopTrial}>Stop test</Button> : <Button size="sm" disabled={!snapshot.canPractice || active !== null} onClick={() => actions.startTrial(m.id)}>Test ×10</Button>}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </section>
      <section aria-label="Developer event log">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-bold">Event log</h2>
          <div className="flex flex-wrap items-center gap-3"><label className="text-sm">Event type <select aria-label="Event type" value={filter} onChange={e => setFilter(e.target.value)} className="min-h-9 border border-ink bg-surface px-2"><option value="all">All events</option>{DIAGNOSTIC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></label><Button size="sm" variant="secondary" onClick={actions.clearDiagnostics}>Clear logs</Button><Button size="sm" onClick={download}>Download JSON</Button></div>
        </div>
        <p className="text-xs text-muted">{snapshot.diagnostics.events.length} / 500 retained · {snapshot.diagnostics.dropped} older events dropped. Stored in memory for this visit. Export includes results and measurements; no footage or raw landmarks.</p>
        {downloadError && <p role="alert">{downloadError}</p>}
        <div className="max-h-80 overflow-auto border border-ink/20" tabIndex={0} aria-label="Scrollable event history">
          {logs.length ? <ol className="m-0 list-none divide-y divide-ink/20 p-0 font-mono text-xs">{[...logs].reverse().map(e => <li key={e.id} className="break-words p-3"><span className="font-bold">+{(e.elapsedMs / 1000).toFixed(2)}s · {e.category} · {e.event}</span><time className="ml-2 text-muted" dateTime={e.timestamp}>{e.timestamp.slice(11, 23)}</time><pre className="mb-0 mt-1 whitespace-pre-wrap break-all text-muted">{JSON.stringify(e.data)}</pre></li>)}</ol> : <p className="p-3 text-sm text-muted">No events{filter !== 'all' ? ' match this filter' : ' yet'}.</p>}
        </div>
      </section>
    </div>}
  </details>;
}
