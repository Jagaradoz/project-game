import type { DiagnosticEvent } from '@/engine/core/diagnostics';

export const LOG_CATEGORIES = {
  lifecycle: 'System', tracking: 'Tracking', detection: 'Movement', practice: 'Guide',
  trial: 'Evaluation', performance: 'Performance', error: 'Errors',
};
const POSES: Record<string, string> = { lateral: 'Side steps', knees: 'Knee lifts', hips: 'Hands on hips', clap: 'Overhead clap' };
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 160) : '';

export function logTime(elapsedMs: number): string {
  const seconds = finite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : 0;
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

/** Display summaries only; the original event and complete payload remain in JSON export. */
export function diagnosticMessage(event: DiagnosticEvent): string | null {
  const d = event.data;
  const pose = POSES[text(d.pose)] ?? 'Movement';
  if (event.category === 'performance') {
    const samples = [[d.poseFps, 'Camera', 'fps'], [d.renderFps, 'Character', 'fps'], [d.processingMs, 'Processing', 'ms']] as const;
    const parts = samples.flatMap(([value, label, unit]) => finite(value) ? [`${label} ${Math.round(value)} ${unit}`] : []);
    return parts.length ? parts.join(' · ') : null;
  }
  if (event.category === 'error') return text(d.message) || 'Something went wrong. Check your camera and try again.';
  if (event.category === 'tracking') return ({ ready: 'Tracking ready', body: 'Step back into view', camera: 'Camera stopped', calibrating: 'Calibrating your position', hidden: 'Paused while the page is hidden', stale: 'Waiting for tracking' } as Record<string, string>)[event.event] ?? 'Tracking changed';
  if (event.category === 'detection') {
    if (d.pose === 'lateral') return ({ LEFT: 'Moved left', RIGHT: 'Moved right', CENTER: 'Returned to centre' } as Record<string, string>)[text(d.lane)] ?? 'Side step detected';
    if (d.pose === 'knees') return `${d.knee === 'LEFT' ? 'Left' : d.knee === 'RIGHT' ? 'Right' : 'Alternate'} knee lifted`;
    return `${pose} detected`;
  }
  if (event.category === 'practice') {
    switch (event.event) {
      case 'counted': return `${pose}: ${finite(d.count) ? d.count : '—'}/${finite(d.goal) ? d.goal : '—'} reps`;
      case 'completed': return `${pose} complete`;
      case 'start': return 'Guided session started';
      case 'resume': return 'Session resumed';
      case 'paused': case 'pause': return text(d.reason) ? `Paused: ${text(d.reason)}` : 'Session paused';
      case 'skip': return `${pose} skipped`;
      case 'restart': return 'Session reset';
      case 'rest-started': return 'Rest started · 20 seconds';
      case 'round-started': return finite(d.round) ? `Round ${d.round} started` : 'Next round started';
      case 'pose-started': case 'next': return `Next: ${pose}`;
      case 'continue': return 'Rest ended · next round';
      case 'session-finished': return d.reason === 'time' ? '20-minute session complete' : 'Session finished';
      case 'mode': return 'Practice mode changed';
      case 'goal': return finite(d.goal) ? `Goal set to ${d.goal} reps` : 'Repetition goal changed';
      case 'prompt': return text(d.expected) || `Follow the guide: ${pose}`;
    }
  }
  if (event.category === 'trial') {
    if (event.event === 'started') return `Evaluation started: ${pose}`;
    if (event.event === 'stopped') return 'Evaluation stopped';
    if (event.event === 'completed') return `Evaluation complete: ${pose}`;
    return `Evaluation: ${pose} · ${d.phase === 'rest' ? 'Rest' : d.phase === 'ready' ? 'Get ready' : 'Follow the prompt'}`;
  }
  if (event.category === 'lifecycle') {
    if (event.event === 'status') return text(d.message) || 'Status updated';
    const messages: Record<string, string> = { 'camera-acquired': 'Camera connected', 'camera-released': 'Camera released', 'character-ready': 'Character ready', 'model-ready': 'Pose detection ready' };
    if (messages[event.event]) return messages[event.event];
  }
  const fallback = event.event.replace(/[-_]/g, ' ').slice(0, 100);
  return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}
