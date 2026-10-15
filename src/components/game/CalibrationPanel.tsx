'use client';
import { Button, LinkButton } from '@/components/ui/Button';
import { CalibrationChecklist, buildChecks } from '@/components/game/CalibrationChecklist';
import { GraphicsSettings } from '@/components/game/GraphicsSettings';
import { Notice } from '@/components/ui/Notice';
import { CHARACTERS } from '@/lib/characters';
import { useSettings } from '@/lib/store/settings';
import type { GameActions, HudSnapshot } from '@/hooks/useGameRuntime';

/** Presentation only: GameCanvas keeps the same runtime and camera through setup. */
export default function CalibrationPanel({ snapshot, actions, forGame = false }: {
  snapshot: HudSnapshot; actions: GameActions; forGame?: boolean;
}) {
  const character = useSettings(s => s.character), setCharacter = useSettings(s => s.setCharacter);
  const difficulty = useSettings(s => s.startingDifficulty), setDifficulty = useSettings(s => s.setStartingDifficulty);
  const checks = buildChecks(snapshot, { hasLeaned: snapshot.rehearsal.left && snapshot.rehearsal.right,
    hasJogged: snapshot.rehearsal.knees, hasRaisedArms: snapshot.rehearsal.clap, hasHeldHips: snapshot.rehearsal.hips });
  return <div className="flex flex-col gap-4">
    <div>
      <h1 className="m-0 text-2xl font-black tracking-tight">{forGame ? 'Get ready to play' : 'Camera calibration'}</h1>
      <p className="mt-2 mb-0 text-sm text-muted">Stand with your head and knees visible. Try left and right, knee lifts, hands on hips, and a clap overhead. You never need to jump physically.</p>
    </div>
    <p className="m-0 text-sm text-muted">Clear your space and move gently. Stop if you feel unwell. Camera frames stay on this device; visit data clears on reload.</p>
    {snapshot.error && <Notice tone="error">{snapshot.error}</Notice>}
    <div className="flex flex-wrap gap-2">
      <Button onClick={snapshot.isCameraRunning ? actions.stopCamera : actions.startCamera} size="sm">{snapshot.isCameraRunning ? 'Stop camera' : 'Allow camera'}</Button>
      <Button variant="secondary" size="sm" onClick={actions.recalibrate} disabled={!snapshot.isCameraRunning}>Reset centre</Button>
      <LinkButton href="/test" variant="secondary" size="sm">Test Mode</LinkButton>
    </div>
    <p role="status" className="m-0 text-sm text-muted">{snapshot.status}</p>
    <CalibrationChecklist checks={checks} />
    {forGame && <>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-bold">Character
          <select className="min-h-11 border-2 border-ink bg-surface px-2" value={character} onChange={e => setCharacter(e.target.value)}>
            {CHARACTERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">Starting difficulty
          <select className="min-h-11 border-2 border-ink bg-surface px-2" value={difficulty} onChange={e => setDifficulty(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}{n === 1 ? ' · Gentle' : n === 5 ? ' · Most challenging' : ''}</option>)}
          </select>
        </label>
      </div>
      <p className="m-0 text-xs text-muted">Difficulty increases every four gameplay minutes, up to level 5. Your knee-lift cadence controls speed at every level.</p>
      <details><summary className="min-h-11 cursor-pointer py-2 font-bold">Graphics</summary><GraphicsSettings activeQuality={snapshot.quality} /></details>
      <Button disabled={!snapshot.canBegin || !snapshot.isSceneReady} onClick={() => actions.beginRun(difficulty)}>Start Game Mode</Button>
    </>}
    {!forGame && <LinkButton href="/play" variant="primary">Open Game Mode setup</LinkButton>}
    {!forGame && <p className="m-0 text-sm text-muted">Game Mode checks calibration again in its own camera session before each run.</p>}
  </div>;
}
