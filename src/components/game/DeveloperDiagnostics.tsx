'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DIAGNOSTIC_CATEGORIES } from '@/engine/core/diagnostics';
import { MOVEMENTS } from '@/lib/testing/evaluation';
import { evaluationCells, systemReadings } from '@/lib/testing/evaluationPresentation';
import type { GameActions, HudSnapshot } from '@/hooks/useGameRuntime';
import { diagnosticMessage, logTime, LOG_CATEGORIES } from '@/lib/testing/diagnosticPresentation';
import { version } from '../../../package.json';

const EVALUATION_COLUMNS = ['Attempts', 'Correct', 'Missed', 'Wrong lane', 'Wrong knee', 'Other movement', 'Error % (95% CI)', 'Response mean / P95', 'Detection-to-render mean / P95'];
function number(value: number | null, suffix = '') { return value === null ? '—' : `${value.toFixed(0)}${suffix}`; }

export function DeveloperDiagnostics({ snapshot, actions, view }: { snapshot: HudSnapshot; actions: GameActions; view: 'measurements' | 'logs' | 'evaluation' }) {
  const [filter, setFilter] = useState('all');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const evaluation = snapshot.evaluation;
  const voided = evaluation.voided.tracking + evaluation.voided.paused + evaluation.voided.cueChanged;
  const logs = view === 'logs' ? snapshot.diagnostics.events
    .filter(e => filter === 'all' || e.category === filter)
    .map(event => ({ event, message: diagnosticMessage(event) }))
    .filter(entry => entry.message !== null) : [];
  function download() {
    const report = actions.getDiagnosticReport(version);
    if (!report) { setDownloadError('Diagnostics are not ready. Try again.'); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `guide-mode-${report.exportedAt.replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setDownloadError(null);
  }
  return <div className="space-y-5" data-testid="developer-diagnostics">
    {view === 'measurements' && <section aria-label="Live measurements">

        <dl className="m-0 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Pose FPS', number(snapshot.poseFps)], ['Render FPS', number(snapshot.renderFps)],
            ['Processing', number(snapshot.processingMs, ' ms')], ['Inference', number(snapshot.inferenceMs, ' ms')],
            ['Latency mean / P95', `${number(snapshot.metrics.latencyMeanMs)} / ${number(snapshot.metrics.latencyP95Ms)} ms`], ['Character speed', `${snapshot.speed.toFixed(2)} m/s`],
          ].map(([label, value]) => <div key={label} className="border border-ink/20 p-3"><dt className="text-xs text-muted">{label}</dt><dd className="m-0 mt-1 font-bold tabular-nums">{value}</dd></div>)}
        </dl>
        <p className="text-xs text-muted">Model {snapshot.poseModel ?? '—'} · Delegate {snapshot.delegate ?? '—'} · Camera {snapshot.cameraLabel ?? '—'}</p>
      </section>}
      {view === 'evaluation' && <section aria-label="Continuous evaluation">
        <p className="mb-3 mt-0 text-sm text-muted">Every guided cue is scored automatically as one attempt. Attempts cut off by a pause, lost tracking or a skipped pose are not scored.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-xs text-muted"><th className="py-2 pr-3">Movement</th>{EVALUATION_COLUMNS.map(c => <th key={c} className="py-2 pr-3">{c}</th>)}</tr></thead>
            <tbody>
              {MOVEMENTS.map(m => <tr key={m.id} className="border-t border-ink/20"><td className="py-2 pr-3">{m.title}</td>{evaluationCells(m.id, evaluation.byPose[m.id], snapshot.metrics.latencyByPose[m.id]).map((cell, i) => <td key={EVALUATION_COLUMNS[i]} className="whitespace-nowrap py-2 pr-3 tabular-nums">{cell}</td>)}</tr>)}
              <tr className="border-t-2 border-ink font-bold"><td className="py-2 pr-3">All movements</td>{evaluationCells('overall', evaluation.overall, { meanMs: snapshot.metrics.latencyMeanMs, p95Ms: snapshot.metrics.latencyP95Ms, minMs: snapshot.metrics.latencyMinMs, maxMs: snapshot.metrics.latencyMaxMs, samples: snapshot.metrics.latencySamples }).map((cell, i) => <td key={EVALUATION_COLUMNS[i]} className="whitespace-nowrap py-2 pr-3 tabular-nums">{cell}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <dl aria-label="System" className="m-0 mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7">
          {systemReadings(snapshot, snapshot.metrics).map(([label, value]) => <div key={label} className="border border-ink/20 p-3"><dt className="text-xs text-muted">{label}</dt><dd className="m-0 mt-1 font-bold tabular-nums">{value}</dd></div>)}
        </dl>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-xs text-muted">{voided} not scored{evaluation.dropped > 0 ? ` · ${evaluation.dropped} oldest attempts dropped` : ''}. Every attempt is in the JSON report.</p>
          <Button size="sm" onClick={download}>Download JSON</Button>
        </div>
        {downloadError && <p role="alert">{downloadError}</p>}
      </section>}
      {view === 'logs' && <section aria-label="Developer event log">
        <div className="flex flex-wrap items-center justify-between gap-3">

          <div className="flex flex-wrap items-center gap-3"><label className="text-sm">Event type <select aria-label="Event type" value={filter} onChange={e => setFilter(e.target.value)} className="min-h-9 border border-ink bg-surface px-2"><option value="all">All events</option>{DIAGNOSTIC_CATEGORIES.map(c => <option key={c} value={c}>{LOG_CATEGORIES[c]}</option>)}</select></label><Button size="sm" variant="secondary" onClick={actions.clearDiagnostics}>Clear logs</Button><Button size="sm" onClick={download}>Download JSON</Button></div>
        </div>
        <p className="mb-2 mt-3 text-xs text-muted">{logs.length} shown · {snapshot.diagnostics.events.length} / 500 retained{snapshot.diagnostics.dropped > 0 ? ` · ${snapshot.diagnostics.dropped} older events dropped` : ''}. Full details in JSON.</p>
        {downloadError && <p role="alert">{downloadError}</p>}
        <div className="max-h-80 overflow-auto border border-ink/20" tabIndex={0} aria-label="Scrollable event history">
          {logs.length ? <ol className="m-0 list-none divide-y divide-ink/20 p-0 text-sm">{[...logs].reverse().map(({ event: e, message }) => <li key={e.id} data-category={e.category} className="flex items-start gap-3 px-3 py-2.5"><time className="shrink-0 pt-0.5 text-xs tabular-nums text-muted" dateTime={e.timestamp}>{logTime(e.elapsedMs)}</time><span className="min-w-0 break-words leading-snug">{message}</span></li>)}</ol> : <p className="p-3 text-sm text-muted">No events{filter !== 'all' ? ' match this filter' : ' yet'}. Events appear when something happens.</p>}
        </div>
      </section>}
  </div>;
}
