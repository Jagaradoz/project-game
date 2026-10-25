import { POSE_IDS } from '@/engine/core/trial';
import type { PoseEvent, PoseId, PoseReadout } from '@/engine/core/trial';
import type { UpKnee } from '@/engine/types';

export const PRACTICE_DURATION_MS = 20 * 60 * 1000;
export const PRACTICE_TRANSITION_MS = 3000;
export const PRACTICE_REST_MS = 20000;
export type PracticeGoal = 5 | 10;
export type PracticeMode = 'guided' | 'free';
export type PracticePhase = 'idle' | 'ready' | 'active' | 'paused' | 'complete' | 'rest' | 'summary';
type RunningPhase = 'ready' | 'active' | 'complete' | 'rest';
export interface PracticeReadout extends PoseReadout { clapArmed: boolean }
export interface PracticeState {
  mode: PracticeMode;
  pose: PoseId;
  goal: PracticeGoal;
  count: number;
  phase: PracticePhase;
  prompt: string;
  results: Record<PoseId, 'pending' | 'completed' | 'skipped'>;
  pauseReason: string | null;
  pausedPhase: RunningPhase | null;
  nextSide: 'LEFT' | 'RIGHT';
  targetKnee: UpKnee;
  laneStep: 'out' | 'back';
  sessionStarted: boolean;
  elapsedMs: number;
  remainingPhaseMs: number;
  round: number;
  completedRounds: number;
  totals: Record<PoseId, number>;
  skips: number;
  unfinishedPose: PoseId | null;
  finishReason: 'time' | 'manual' | null;
}
export type PracticeCommand =
  | { type: 'start' | 'resume' | 'restart' | 'skip' | 'next' | 'finish' | 'continue' }
  | { type: 'pause'; reason?: string }
  | { type: 'select'; pose: PoseId }
  | { type: 'mode'; mode: PracticeMode }
  | { type: 'goal'; goal: PracticeGoal };
const SETUP: Record<PoseId, string> = {
  lateral: 'Stand in the centre to begin.',
  knees: 'Lift either knee once to set your starting side. This first lift does not count.',
  hips: 'Release both hands from your hips to get ready.',
  clap: 'Separate your hands to get ready for an overhead clap.',
};
const pending = (): PracticeState['results'] => ({ lateral: 'pending', knees: 'pending', hips: 'pending', clap: 'pending' });
export function createPracticeState(): PracticeState {
  return { mode: 'guided', pose: 'lateral', goal: 5, count: 0, phase: 'idle',
    prompt: 'Start your guided session when you are ready.', results: pending(),
    pauseReason: null, pausedPhase: null, nextSide: 'LEFT', targetKnee: null, laneStep: 'out',
    sessionStarted: false, elapsedMs: 0, remainingPhaseMs: 0, round: 1, completedRounds: 0,
    totals: { lateral: 0, knees: 0, hips: 0, clap: 0 }, skips: 0, unfinishedPose: null, finishReason: null };
}
function resetPose(state: PracticeState, pose: PoseId): PracticeState {
  return { ...state, pose, count: 0, phase: 'idle', prompt: 'Start when you are ready.',
    pauseReason: null, pausedPhase: null, remainingPhaseMs: 0, nextSide: 'LEFT', targetKnee: null, laneStep: 'out' };
}
function ready(state: PracticeState): PracticeState {
  return { ...state, phase: 'ready', pauseReason: null, pausedPhase: null, remainingPhaseMs: 0,
    targetKnee: null, laneStep: 'out', prompt: SETUP[state.pose] };
}
function nextRound(state: PracticeState): PracticeState {
  return ready({ ...resetPose(state, 'lateral'), round: state.round + 1, results: pending() });
}
function advance(state: PracticeState): PracticeState {
  const index = POSE_IDS.indexOf(state.pose) + 1;
  return index === POSE_IDS.length
    ? { ...state, phase: 'rest', pausedPhase: null, pauseReason: null, remainingPhaseMs: PRACTICE_REST_MS,
        prompt: 'Take a short rest. The next round starts automatically.' }
    : ready(resetPose(state, POSE_IDS[index]));
}
function finish(state: PracticeState, reason: 'time' | 'manual'): PracticeState {
  const phase = state.phase === 'paused' ? state.pausedPhase : state.phase;
  return { ...state, phase: 'summary', pauseReason: null, pausedPhase: null, remainingPhaseMs: 0,
    unfinishedPose: phase === 'ready' || phase === 'active' ? state.pose : null,
    finishReason: reason, prompt: reason === 'time' ? 'Your 20-minute guided session is complete.' : 'Your guided session has ended.' };
}
export function practiceCommand(state: PracticeState, command: PracticeCommand): PracticeState {
  switch (command.type) {
    case 'start':
      return state.mode === 'guided' && state.phase === 'idle'
        ? ready({ ...state, sessionStarted: true }) : state;
    case 'pause':
      return ['ready', 'active', 'complete', 'rest'].includes(state.phase)
        ? { ...state, phase: 'paused', pausedPhase: state.phase as RunningPhase,
            pauseReason: command.reason ?? 'Taking a break', prompt: 'Paused. Resume when you are ready.' } : state;
    case 'resume':
      if (state.mode !== 'guided' || state.phase !== 'paused') return state;
      return state.pausedPhase === 'complete' || state.pausedPhase === 'rest'
        ? { ...state, phase: state.pausedPhase, pausedPhase: null, pauseReason: null,
            prompt: state.pausedPhase === 'rest' ? 'Take a short rest. The next round starts automatically.' : 'Pose complete. Get ready for the next pose.' }
        : ready(state);
    case 'restart': return { ...createPracticeState(), goal: state.goal };
    case 'skip':
      return state.mode === 'guided' && state.sessionStarted && (state.phase === 'ready' || state.phase === 'active' || state.phase === 'complete')
        ? advance(state.phase === 'complete' ? state : { ...state, skips: state.skips + 1, results: { ...state.results, [state.pose]: 'skipped' } }) : state;
    case 'next': return state.mode === 'guided' && state.phase === 'complete' ? advance(state) : state;
    case 'continue': return state.mode === 'guided' && state.phase === 'rest' ? nextRound(state) : state;
    case 'finish': return state.sessionStarted && state.phase !== 'summary' ? finish(state, 'manual') : state;
    case 'select': return !state.sessionStarted ? resetPose(state, command.pose) : state;
    case 'mode': {
      if (command.mode === state.mode) return state;
      const paused = command.mode === 'free' ? practiceCommand(state, { type: 'pause', reason: 'Free practice' }) : state;
      return { ...paused, mode: command.mode };
    }
    case 'goal': return state.sessionStarted || state.goal === command.goal ? state : { ...state, goal: command.goal };
  }
}
/** Advance the session with runtime-owned monotonic deltas. No wall-clock timers. */
export function tickPractice(state: PracticeState, deltaMs: number): PracticeState {
  if (state.mode !== 'guided' || !['ready', 'active', 'complete', 'rest'].includes(state.phase)
    || !Number.isFinite(deltaMs) || deltaMs <= 0) return state;
  // Session expiry wins over pose/rest boundaries, including an unfinished pose.
  const elapsedMs = Math.min(PRACTICE_DURATION_MS, state.elapsedMs + deltaMs);
  let next = { ...state, elapsedMs };
  if (elapsedMs >= PRACTICE_DURATION_MS) return finish(next, 'time');
  let remaining = deltaMs;
  while (next.phase === 'complete' || next.phase === 'rest') {
    if (remaining < next.remainingPhaseMs) return { ...next, remainingPhaseMs: next.remainingPhaseMs - remaining };
    remaining -= next.remainingPhaseMs;
    next = next.phase === 'complete' ? advance(next) : nextRound(next);
  }
  return next;
}
function counted(state: PracticeState): PracticeState {
  const count = state.count + 1;
  const totals = { ...state.totals, [state.pose]: state.totals[state.pose] + 1 };
  if (count >= state.goal) return { ...state, count, totals, phase: 'complete', remainingPhaseMs: PRACTICE_TRANSITION_MS,
    results: { ...state.results, [state.pose]: 'completed' },
    completedRounds: state.completedRounds + Number(state.pose === 'clap' && POSE_IDS.every(pose => pose === 'clap' || state.results[pose] === 'completed')),
    prompt: 'Pose complete. Get ready for the next pose.' };
  if (state.pose === 'knees') return { ...state, count, totals,
    targetKnee: state.targetKnee === 'LEFT' ? 'RIGHT' : 'LEFT',
    prompt: 'Lift your ' + (state.targetKnee === 'LEFT' ? 'right' : 'left') + ' knee.' };
  return ready({ ...state, count, totals, nextSide: state.pose === 'lateral'
    ? state.nextSide === 'LEFT' ? 'RIGHT' : 'LEFT' : state.nextSide });
}

/** Feed each detector frame directly; UI snapshots may be throttled independently. */
export function updatePractice(
  state: PracticeState,
  events: readonly PoseEvent[],
  readout: PracticeReadout,
): PracticeState {
  if (state.mode !== 'guided' || (state.phase !== 'ready' && state.phase !== 'active')) return state;
  const relevant = events.filter(event => event.pose === state.pose);
  if (state.phase === 'ready') {
    switch (state.pose) {
      case 'lateral':
        return readout.lane === 'CENTER' ? { ...state, phase: 'active', prompt: `Move ${state.nextSide.toLowerCase()}, then return to the centre.` } : state;
      case 'knees':
        return readout.upKnee ? { ...state, phase: 'active', targetKnee: readout.upKnee === 'LEFT' ? 'RIGHT' : 'LEFT',
          prompt: `Lift your ${readout.upKnee === 'LEFT' ? 'right' : 'left'} knee.` } : state;
      case 'hips':
        return !readout.isHandsOnHips ? { ...state, phase: 'active', prompt: 'Place both hands on your hips and hold.' } : state;
      case 'clap': {
        // Runtime includes the detector's previous armed state on a clap frame,
        // since the successful detection itself disarms the detector.
        if (!readout.clapArmed) return state;
        if (relevant.length > 0) return counted(state);
        return { ...state, phase: 'active', prompt: 'Clap your hands together above your head.' };
      }
    }
  }
  switch (state.pose) {
    case 'lateral':
      if (state.laneStep === 'out') {
        return relevant.some(event => event.lane === state.nextSide)
          ? { ...state, laneStep: 'back', prompt: 'Return to the centre to finish this repetition.' } : state;
      }
      return relevant.some(event => event.lane === 'CENTER') ? counted(state) : state;
    case 'knees':
      return relevant.some(event => event.knee === state.targetKnee) ? counted(state) : state;
    case 'hips':
    case 'clap':
      return relevant.length > 0 ? counted(state) : state;
  }
}
