'use client';
import { Button, LinkButton } from '@/components/ui/Button';
import { MOVEMENTS } from '@/lib/testing/evaluation';
import type { GameActions, HudSnapshot } from '@/hooks/useGameRuntime';
import { PoseDemo } from './PoseDemo';

export function PracticeOverview({ snapshot, actions }: { snapshot: HudSnapshot; actions: GameActions }) {
  const p = snapshot.practice;
  const busy = ['ready', 'active', 'paused'].includes(p.phase);
  const command = actions.practiceCommand;
  return <div className="mb-5 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <p className="m-0 text-xs font-bold uppercase tracking-widest text-accent-text">Learn the controls</p>
      <h1 className="mb-2 mt-1 text-3xl font-black tracking-tight">Test Mode</h1>
      <p className="m-0 text-sm text-muted">4 movements. Practise at your own pace.</p>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Practice mode">
      <Button size="sm" variant={p.mode === 'guided' ? 'primary' : 'secondary'} aria-pressed={p.mode === 'guided'} onClick={() => command({ type: 'mode', mode: 'guided' })}>Guided practice</Button>
      <Button size="sm" variant={p.mode === 'free' ? 'primary' : 'secondary'} aria-pressed={p.mode === 'free'} onClick={() => command({ type: 'mode', mode: 'free' })}>Free practice</Button>
    </div>
    </div>
    <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4" aria-label="All four movements">
      {MOVEMENTS.map((m, i) => <li key={m.id}>
        <button type="button" onClick={() => command({ type: 'select', pose: m.id })} aria-current={p.pose === m.id && p.phase !== 'summary' ? 'step' : undefined} className={`flex h-full min-h-14 w-full cursor-pointer items-start gap-3 border-2 p-3 text-left ${p.pose === m.id && p.phase !== 'summary' ? 'border-ink bg-primary-soft' : 'border-ink/20 bg-surface hover:border-ink'}`}>
          <span className="font-black text-accent-text">0{i + 1}</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{m.title}</span><span className="block text-xs text-muted">{m.effect}</span></span>
          <span className="text-xs font-bold capitalize">{p.results[m.id] === 'pending' ? p.pose === m.id && busy ? `${p.count}/${p.goal}` : 'To do' : p.results[m.id]}</span>
        </button>
      </li>)}
    </ol>
  </div>;
}

export function PracticeGuide({ snapshot, actions }: { snapshot: HudSnapshot; actions: GameActions }) {
  const p = snapshot.practice;
  const movement = MOVEMENTS.find(m => m.id === p.pose)!;
  const index = MOVEMENTS.findIndex(m => m.id === p.pose);
  const busy = ['ready', 'active', 'paused'].includes(p.phase);
  const command = actions.practiceCommand;
  const readiness = !snapshot.isCameraRunning ? 'Allow camera access to begin.' : !snapshot.hasBody || !snapshot.kneesVisible ? 'Step back until your head and knees are visible.' : !snapshot.isCalibrated ? 'Stand still in the centre to calibrate.' : 'Tracking is ready. Start when you are comfortable.';
  return <section aria-label="Practice guide" className="min-w-0">
    {p.phase === 'summary' ? <div role="status" className="space-y-3 border-2 border-ink bg-primary-soft p-4">
      <h2 className="m-0 text-2xl font-black">{Object.values(p.results).every(r => r === 'completed') ? 'All four poses complete!' : 'Practice reviewed'}</h2>
      <p className="m-0 text-sm">{Object.values(p.results).filter(r => r === 'completed').length} completed · {Object.values(p.results).filter(r => r === 'skipped').length} skipped. Choose any pose to practise again.</p>
      <LinkButton href="/play" size="sm">Go to game setup</LinkButton>
    </div> : <div className="space-y-4 border-2 border-ink bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide">{p.mode === 'guided' ? `Pose ${index + 1} of 4` : 'Free practice'}</span>
        {p.mode === 'guided' && <label className="flex items-center gap-2 text-sm">Reps <select aria-label="Repetition goal" disabled={busy} value={p.goal} onChange={e => command({ type: 'goal', goal: Number(e.target.value) as 5 | 10 })} className="min-h-9 border border-ink bg-surface px-2 font-bold disabled:opacity-50"><option value={5}>5</option><option value={10}>10</option></select></label>}
      </div>
      <h2 className="m-0 text-xl font-black">{movement.title}</h2>
      <PoseDemo key={p.pose} pose={p.pose} />
      <p className="m-0 text-sm leading-relaxed">{movement.instruction}</p>
      {p.mode === 'guided' && <>
        {p.pose === 'knees' && <p className="m-0 text-xs text-muted">Your first knee lift sets the starting side. Each lift to the other side then counts as one repetition.</p>}
        <div role="status" aria-live="polite" aria-atomic="true" className="border-l-4 border-primary bg-primary-soft p-3">
          <p className="m-0 text-lg font-black">{p.phase === 'paused' ? 'Practice paused' : p.phase === 'complete' ? 'Pose complete!' : p.prompt}</p>
          <p className="mb-0 mt-1 font-bold tabular-nums">{p.count} / {p.goal} successful repetitions</p>
          {p.count > 0 && <p className="mb-0 mt-1 text-xs">Counted · {p.count} successful</p>}
          {p.phase === 'paused' && <p className="mb-0 mt-1 text-sm">{p.pauseReason}. Resume when ready; completed repetitions are kept.</p>}
        </div>
        <progress aria-label="Successful repetitions" value={p.count} max={p.goal} className="h-2 w-full accent-primary" />
        <div className="flex flex-wrap gap-3">
          {p.phase === 'idle' && <Button disabled={!snapshot.canPractice} onClick={() => command({ type: 'start' })}>Start pose</Button>}
          {['ready', 'active'].includes(p.phase) && <Button variant="secondary" onClick={() => command({ type: 'pause', reason: 'Taking a break' })}>Pause</Button>}
          {p.phase === 'paused' && <Button disabled={!snapshot.canPractice} onClick={() => command({ type: 'resume' })}>Resume practice</Button>}
          {p.phase === 'complete' && <><Button onClick={() => command({ type: 'next' })}>{index === 3 ? 'Finish practice' : 'Next pose'}</Button><Button variant="secondary" onClick={() => command({ type: 'restart' })}>Repeat pose</Button></>}
          {busy && <Button variant="secondary" onClick={() => command({ type: 'restart' })}>Restart pose</Button>}
          {p.phase !== 'complete' && <Button variant="ghost" onClick={() => command({ type: 'skip' })}>Skip pose</Button>}
        </div>
      </>}
      {p.mode === 'free' && <p className="m-0 text-sm font-bold text-accent-text">Try any movement. The character responds to all four poses, with no repetition goal.</p>}
      <p className="m-0 text-xs text-muted">{readiness}</p>
    </div>}
  </section>;
}
