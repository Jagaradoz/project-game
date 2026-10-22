import { POSE_IDS } from '@/engine/core/trial';
import type { PoseEvent, PoseId, PoseReadout } from '@/engine/core/trial';
import type { UpKnee } from '@/engine/types';

export type PracticeGoal = 5 | 10;
export type PracticeMode = 'guided' | 'free';
export type PracticePhase = 'idle' | 'ready' | 'active' | 'paused' | 'complete' | 'summary';
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
  nextSide: 'LEFT' | 'RIGHT';
  targetKnee: UpKnee;
  laneStep: 'out' | 'back';
}
export type PracticeCommand =
  | { type: 'start' | 'resume' | 'restart' | 'skip' | 'next' }
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

export function createPracticeState(): PracticeState {
  return { mode: 'guided', pose: 'lateral', goal: 5, count: 0, phase: 'idle',
    prompt: 'Press Start to practise moving between lanes.',
    results: { lateral: 'pending', knees: 'pending', hips: 'pending', clap: 'pending' },
    pauseReason: null, nextSide: 'LEFT', targetKnee: null, laneStep: 'out' };
}

function reset(state: PracticeState, pose = state.pose): PracticeState {
  return { ...state, pose, count: 0, phase: 'idle', prompt: 'Press Start when you are ready.',
    pauseReason: null, nextSide: 'LEFT', targetKnee: null, laneStep: 'out' };
}

function ready(state: PracticeState): PracticeState {
  return { ...state, phase: 'ready', pauseReason: null, targetKnee: null,
    laneStep: 'out', prompt: SETUP[state.pose] };
}

function advance(state: PracticeState): PracticeState {
  const index = POSE_IDS.indexOf(state.pose) + 1;
  return index === POSE_IDS.length
    ? { ...state, phase: 'summary', pauseReason: null, prompt: 'Practice finished. Review your completed and skipped poses.' }
    : reset(state, POSE_IDS[index]);
}

export function practiceCommand(state: PracticeState, command: PracticeCommand): PracticeState {
  switch (command.type) {
    case 'start':
      return state.mode === 'guided' && state.phase === 'idle'
        ? ready({ ...state, results: { ...state.results, [state.pose]: 'pending' } }) : state;
    case 'pause':
      return state.phase === 'ready' || state.phase === 'active'
        ? { ...state, phase: 'paused', pauseReason: command.reason ?? 'Practice paused.', prompt: 'Paused. Resume when tracking is ready.' } : state;
    case 'resume':
      return state.phase === 'paused' ? ready(state) : state;
    case 'restart':
      return { ...reset(state), results: { ...state.results, [state.pose]: 'pending' } };
    case 'skip':
      return state.mode === 'guided' && state.phase !== 'summary'
        ? advance({ ...state, results: { ...state.results, [state.pose]: 'skipped' } }) : state;
    case 'next':
      return state.phase === 'complete' ? advance(state) : state;
    case 'select':
      return reset(state, command.pose);
    case 'mode':
      return command.mode === state.mode ? state : { ...reset(state), mode: command.mode };
    case 'goal':
      return state.phase === 'ready' || state.phase === 'active' || state.phase === 'paused'
        ? state : command.goal === state.goal ? state : { ...reset(state), goal: command.goal };
  }
}

function counted(state: PracticeState): PracticeState {
  const count = state.count + 1;
  if (count >= state.goal) return { ...state, count, phase: 'complete',
    results: { ...state.results, [state.pose]: 'completed' }, prompt: 'Counted! Pose complete. Choose Next or Repeat.' };
  if (state.pose === 'knees') return { ...state, count,
    targetKnee: state.targetKnee === 'LEFT' ? 'RIGHT' : 'LEFT',
    prompt: `Lift your ${state.targetKnee === 'LEFT' ? 'right' : 'left'} knee.` };
  return ready({ ...state, count, nextSide: state.pose === 'lateral'
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
