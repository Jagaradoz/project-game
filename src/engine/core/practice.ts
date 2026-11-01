import { POSE_IDS } from '@/engine/core/trial';
import type { PoseEvent, PoseId, PoseReadout } from '@/engine/core/trial';
import type { UpKnee } from '@/engine/types';

export const PRACTICE_DURATION_MS = 20 * 60 * 1000;
export const PRACTICE_TRANSITION_MS = 3000;
export const PRACTICE_REST_MS = 20000;
/** Longest run of side steps prompted towards the same side. */
export const PRACTICE_MAX_SAME_SIDE = 2;
const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;
const LCG_MODULUS = 2 ** 32;
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
  /** Consecutive prompts towards `nextSide`, capped by PRACTICE_MAX_SAME_SIDE. */
  sideRun: number;
  /** This round's shuffled pose order. During rest it already holds the next round. */
  order: PoseId[];
  /** Index of `pose` in `order`; -1 while resting between rounds. */
  step: number;
  /** Seeded LCG state, so a session's random sequence is reproducible in tests. */
  seed: number;
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
function random(seed: number): { value: number; seed: number } {
  const next = (seed * LCG_MULTIPLIER + LCG_INCREMENT) >>> 0;
  return { value: next / LCG_MODULUS, seed: next };
}
/** Every pose once per round in a random order; a round never opens with the pose that closed the last. */
function shuffleRound(seed: number, previous: PoseId | null): { order: PoseId[]; seed: number } {
  const order = [...POSE_IDS];
  let live = seed;
  for (let i = order.length - 1; i > 0; i--) {
    const roll = random(live); live = roll.seed;
    const j = Math.floor(roll.value * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (order[0] === previous) {
    const roll = random(live); live = roll.seed;
    const j = 1 + Math.floor(roll.value * (order.length - 1));
    [order[0], order[j]] = [order[j]!, order[0]!];
  }
  return { order, seed: live };
}
/** Random side step, flipped once the same side has been asked for PRACTICE_MAX_SAME_SIDE times running. */
function pickSide(state: PracticeState, run: number): Pick<PracticeState, 'nextSide' | 'sideRun' | 'seed'> {
  const roll = random(state.seed);
  const rolled = roll.value < 0.5 ? 'LEFT' : 'RIGHT';
  const nextSide = rolled === state.nextSide && run >= PRACTICE_MAX_SAME_SIDE ? (rolled === 'LEFT' ? 'RIGHT' : 'LEFT') : rolled;
  return { nextSide, sideRun: nextSide === state.nextSide ? run + 1 : 1, seed: roll.seed };
}
export function createPracticeState(seed = 1): PracticeState {
  const round = shuffleRound(seed >>> 0, null);
  const base: PracticeState = { mode: 'guided', pose: round.order[0]!, goal: 5, count: 0, phase: 'idle',
    prompt: 'Start your guided session when you are ready.', results: pending(),
    pauseReason: null, pausedPhase: null, nextSide: 'LEFT', sideRun: 0, order: round.order, step: 0, seed: round.seed,
    targetKnee: null, laneStep: 'out',
    sessionStarted: false, elapsedMs: 0, remainingPhaseMs: 0, round: 1, completedRounds: 0,
    totals: { lateral: 0, knees: 0, hips: 0, clap: 0 }, skips: 0, unfinishedPose: null, finishReason: null };
  return { ...base, ...pickSide(base, 0) };
}
function resetPose(state: PracticeState, pose: PoseId): PracticeState {
  return { ...state, ...pickSide(state, 0), pose, count: 0, phase: 'idle', prompt: 'Start when you are ready.',
    pauseReason: null, pausedPhase: null, remainingPhaseMs: 0, targetKnee: null, laneStep: 'out' };
}
function ready(state: PracticeState): PracticeState {
  return { ...state, phase: 'ready', pauseReason: null, pausedPhase: null, remainingPhaseMs: 0,
    targetKnee: null, laneStep: 'out', prompt: SETUP[state.pose] };
}
function nextRound(state: PracticeState): PracticeState {
  return ready({ ...resetPose(state, state.order[0]!), step: 0, round: state.round + 1, results: pending() });
}
function advance(state: PracticeState): PracticeState {
  const step = state.step + 1;
  if (step < state.order.length) return ready({ ...resetPose(state, state.order[step]!), step });
  // Shuffle the next round now, so the rest screen can name its first pose.
  const upcoming = shuffleRound(state.seed, state.pose);
  return { ...state, order: upcoming.order, step: -1, seed: upcoming.seed, phase: 'rest', pausedPhase: null, pauseReason: null,
    remainingPhaseMs: PRACTICE_REST_MS, prompt: 'Take a short rest. The next round starts automatically.' };
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
    // Reuse the live seed so a restart is not a replay of the same sequence.
    case 'restart': return { ...createPracticeState(state.seed), goal: state.goal };
    case 'skip':
      return state.mode === 'guided' && state.sessionStarted && (state.phase === 'ready' || state.phase === 'active' || state.phase === 'complete')
        ? advance(state.phase === 'complete' ? state : { ...state, skips: state.skips + 1, results: { ...state.results, [state.pose]: 'skipped' } }) : state;
    case 'next': return state.mode === 'guided' && state.phase === 'complete' ? advance(state) : state;
    case 'continue': return state.mode === 'guided' && state.phase === 'rest' ? nextRound(state) : state;
    case 'finish': return state.sessionStarted && state.phase !== 'summary' ? finish(state, 'manual') : state;
    case 'select': return !state.sessionStarted
      ? resetPose({ ...state, order: [command.pose, ...state.order.filter(pose => pose !== command.pose)], step: 0 }, command.pose) : state;
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
    completedRounds: state.completedRounds + Number(state.step === state.order.length - 1
      && state.order.every(pose => pose === state.pose || state.results[pose] === 'completed')),
    prompt: 'Pose complete. Get ready for the next pose.' };
  if (state.pose === 'knees') return { ...state, count, totals,
    targetKnee: state.targetKnee === 'LEFT' ? 'RIGHT' : 'LEFT',
    prompt: 'Lift your ' + (state.targetKnee === 'LEFT' ? 'right' : 'left') + ' knee.' };
  return ready({ ...state, count, totals, ...(state.pose === 'lateral' ? pickSide(state, state.sideRun) : {}) });
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
