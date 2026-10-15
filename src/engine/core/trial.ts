/**
 * Guided error-rate trial for Test Mode.
 *
 * The detector cannot be its own ground truth, so the trial supplies one: it
 * prompts a single pose a fixed number of times and scores each prompt.
 *
 *   correct   the prompted pose was detected inside the window
 *   incorrect a different pose (or the wrong lane) was detected first
 *   missed    nothing was detected before the window closed
 *
 * Error rate = (missed + incorrect) / attempts. Pure reducer; the runtime feeds
 * it the detections of each pose frame in order.
 */

import { CONFIG } from '@/engine/config';
import type { LateralLabel, TrialConfig, UpKnee } from '@/engine/types';

export type PoseId = 'lateral' | 'knees' | 'hips' | 'clap';
export const POSE_IDS: readonly PoseId[] = ['lateral', 'knees', 'hips', 'clap'];

/** One detection from a pose frame. Lane changes carry the lane reached. */
export interface PoseEvent { pose: PoseId; lane?: LateralLabel }

/** Detector state the prompts depend on. */
export interface PoseReadout { lane: LateralLabel; upKnee: UpKnee; isHandsOnHips: boolean }

export interface TrialTally { correct: number; missed: number; incorrect: number }

/**
 * rest     between prompts
 * ready    waiting for a starting position (a knee already up, hands off hips)
 * attempt  prompt shown, window open
 */
export type TrialPhase = 'rest' | 'ready' | 'attempt';

/** Lane to reach, or knee to lift. Null for poses with only one form. */
export type TrialTarget = LateralLabel | 'LEFT_KNEE' | 'RIGHT_KNEE' | null;

export interface ActiveTrial {
  pose: PoseId;
  phase: TrialPhase;
  phaseStartMs: number;
  target: TrialTarget;
  /** Alternates lateral prompts between left and right. */
  lastSide: 'LEFT' | 'RIGHT';
  tally: TrialTally;
}

export interface TrialState {
  active: ActiveTrial | null;
  /** Latest tally per pose. Live while a trial runs, cleared if it is stopped. */
  results: Record<PoseId, TrialTally | null>;
}

const EMPTY_TALLY: TrialTally = { correct: 0, missed: 0, incorrect: 0 };

export function createTrialState(): TrialState {
  return { active: null, results: { lateral: null, knees: null, hips: null, clap: null } };
}

export function tallyAttempts(tally: TrialTally): number {
  return tally.correct + tally.missed + tally.incorrect;
}

/** Starts with a rest so the player can get into position. */
export function startTrial(state: TrialState, pose: PoseId, nowMs: number): TrialState {
  const active: ActiveTrial = { pose, phase: 'rest', phaseStartMs: nowMs, target: null, lastSide: 'RIGHT', tally: EMPTY_TALLY };
  return { active, results: { ...state.results, [pose]: EMPTY_TALLY } };
}

/** Only finished trials are reported, so a stopped one leaves no result. */
export function stopTrial(state: TrialState): TrialState {
  if (!state.active) return state;
  return { active: null, results: { ...state.results, [state.active.pose]: null } };
}

export function updateTrial(
  state: TrialState,
  events: readonly PoseEvent[],
  readout: PoseReadout,
  nowMs: number,
  config: TrialConfig = CONFIG.trial,
): TrialState {
  const active = state.active;
  if (!active) return state;

  if (active.phase === 'attempt') {
    const outcome = scoreAttempt(active, events, nowMs, config);
    if (!outcome) return state;
    const tally = { ...active.tally, [outcome]: active.tally[outcome] + 1 };
    const results = { ...state.results, [active.pose]: tally };
    if (tallyAttempts(tally) >= config.attempts) return { active: null, results };
    return { active: { ...active, phase: 'rest', phaseStartMs: nowMs, target: null, tally }, results };
  }

  if (active.phase === 'rest' && nowMs - active.phaseStartMs < config.restMs) return state;
  const next = nextPrompt(active, readout);
  if (!next) return active.phase === 'ready' ? state : { ...state, active: { ...active, phase: 'ready', phaseStartMs: nowMs } };
  return { ...state, active: { ...active, ...next, phase: 'attempt', phaseStartMs: nowMs } };
}

/** A matching detection wins over a wrong one in the same frame. */
function scoreAttempt(active: ActiveTrial, events: readonly PoseEvent[], nowMs: number, config: TrialConfig): keyof TrialTally | null {
  if (events.some(event => matches(active, event))) return 'correct';
  if (events.length > 0) return 'incorrect';
  return nowMs - active.phaseStartMs >= config.attemptMs ? 'missed' : null;
}

function matches(active: ActiveTrial, event: PoseEvent): boolean {
  if (event.pose !== active.pose) return false;
  return active.pose !== 'lateral' || event.lane === active.target;
}

/** The next prompt from where the body is now, or null if it is not in a starting position. */
function nextPrompt(active: ActiveTrial, readout: PoseReadout): Pick<ActiveTrial, 'target' | 'lastSide'> | null {
  switch (active.pose) {
    case 'lateral': {
      if (readout.lane !== 'CENTER') return { target: 'CENTER', lastSide: active.lastSide };
      const side = active.lastSide === 'LEFT' ? 'RIGHT' : 'LEFT';
      return { target: side, lastSide: side };
    }
    // A step is only counted when the raised knee switches sides, so one knee
    // must already be up before the other can be prompted.
    case 'knees':
      if (readout.upKnee === null) return null;
      return { target: readout.upKnee === 'LEFT' ? 'RIGHT_KNEE' : 'LEFT_KNEE', lastSide: active.lastSide };
    // A shield only counts when it starts, so the hands must be down first.
    case 'hips':
      return readout.isHandsOnHips ? null : { target: null, lastSide: active.lastSide };
    case 'clap':
      return { target: null, lastSide: active.lastSide };
  }
}
