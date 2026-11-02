/**
 * Hands-free evaluation, scored from Guide Mode itself.
 *
 * Every cue the guided session shows is one prompted attempt, so the detectors
 * are scored against an outside ground truth without anyone pressing Start:
 *
 *   correct        the prompted movement (right lane / right knee) was detected
 *   missed         nothing was detected before the window closed
 *   wrongLane      a side step reached a lane other than the prompted one
 *   wrongKnee      a knee lift on the other knee was detected
 *   otherMovement  a different movement was detected first
 *
 * Each attempt is scored once and records how long the detection took after the
 * cue appeared. An attempt cut off before it was decided (tracking lost, pause,
 * skip, cue change) is voided, not scored. Pure reducer; the runtime feeds it
 * every pose frame with the guided practice state before and after that frame.
 */

import { CONFIG } from '@/engine/config';
import { POSE_IDS, type PoseEvent, type PoseId, type TrialTarget } from '@/engine/core/trial';
import type { PracticeState } from '@/engine/core/practice';

export type AttemptOutcome = 'correct' | 'missed' | 'wrongLane' | 'wrongKnee' | 'otherMovement';
export type AttemptError = Exclude<AttemptOutcome, 'correct'>;
export const ATTEMPT_ERRORS: readonly AttemptError[] = ['missed', 'wrongLane', 'wrongKnee', 'otherMovement'];
export type VoidReason = 'tracking' | 'paused' | 'cueChanged';

export interface EvaluationAttempt {
  id: number;
  pose: PoseId;
  /** Lane to reach or knee to lift; null for hands on hips and clap. */
  target: TrialTarget;
  round: number;
  openedMs: number;
  closedMs: number;
  outcome: AttemptOutcome;
  /** Cue to matching detection, including the player's own reaction time. Null unless correct. */
  responseMs: number | null;
  /** The detection that decided a wrong outcome. */
  detected: PoseEvent | null;
}

interface OpenAttempt { key: string; pose: PoseId; target: TrialTarget; round: number; openedMs: number }

export interface EvaluationState {
  open: OpenAttempt | null;
  /** Key of the last cue opened, so a cue that was already scored is not scored again. */
  lastKey: string | null;
  /** Most recent attempts, capped at `maxAttempts`. */
  attempts: readonly EvaluationAttempt[];
  /** Scored attempts pushed out by the cap. */
  dropped: number;
  voided: Record<VoidReason, number>;
  nextId: number;
}

export interface EvaluationConfig { attemptMs: number; maxAttempts: number }

const DEFAULT_CONFIG: EvaluationConfig = { attemptMs: CONFIG.trial.attemptMs, maxAttempts: CONFIG.evaluation.maxAttempts };

export function createEvaluationState(): EvaluationState {
  return { open: null, lastKey: null, attempts: [], dropped: 0, voided: { tracking: 0, paused: 0, cueChanged: 0 }, nextId: 1 };
}

/** The cue being followed now, or null when none is scored (setup, transitions, rest, pauses, free practice). */
export function promptKey(practice: PracticeState): { key: string; target: TrialTarget } | null {
  if (practice.mode !== 'guided') return null;
  // A clap can be armed and completed in one frame, so its setup cue already counts.
  const isClapCue = practice.pose === 'clap' && practice.phase === 'ready';
  if (practice.phase !== 'active' && !isClapCue) return null;
  const base = `${practice.round}:${practice.step}:${practice.pose}:${practice.count}`;
  switch (practice.pose) {
    case 'lateral': {
      const target = practice.laneStep === 'out' ? practice.nextSide : 'CENTER';
      return { key: `${base}:${practice.laneStep}:${target}`, target };
    }
    case 'knees':
      return practice.targetKnee
        ? { key: `${base}:${practice.targetKnee}`, target: practice.targetKnee === 'LEFT' ? 'LEFT_KNEE' : 'RIGHT_KNEE' } : null;
    case 'hips':
    case 'clap':
      return { key: base, target: null };
  }
}

function matches(open: OpenAttempt, event: PoseEvent): boolean {
  if (event.pose !== open.pose) return false;
  if (open.pose === 'lateral') return event.lane === open.target;
  if (open.pose === 'knees') return event.knee === (open.target === 'LEFT_KNEE' ? 'LEFT' : 'RIGHT');
  return true;
}

/** A matching detection in the same frame wins over a wrong one, as in the timed trial. */
function scoreEvents(open: OpenAttempt, events: readonly PoseEvent[]): { outcome: AttemptOutcome; event: PoseEvent } | null {
  const hit = events.find(event => matches(open, event));
  if (hit) return { outcome: 'correct', event: hit };
  const wrong = events[0];
  if (!wrong) return null;
  if (wrong.pose !== open.pose) return { outcome: 'otherMovement', event: wrong };
  return { outcome: open.pose === 'knees' ? 'wrongKnee' : 'wrongLane', event: wrong };
}

function close(state: EvaluationState, open: OpenAttempt, outcome: AttemptOutcome, nowMs: number,
  event: PoseEvent | null, config: EvaluationConfig): EvaluationState {
  const attempt: EvaluationAttempt = {
    id: state.nextId, pose: open.pose, target: open.target, round: open.round, openedMs: open.openedMs, closedMs: nowMs,
    outcome, responseMs: outcome === 'correct' ? Math.max(0, nowMs - open.openedMs) : null,
    detected: outcome === 'correct' || outcome === 'missed' ? null : event,
  };
  const overflow = Math.max(0, state.attempts.length + 1 - config.maxAttempts);
  return { ...state, open: null, attempts: [...state.attempts.slice(overflow), attempt],
    dropped: state.dropped + overflow, nextId: state.nextId + 1 };
}

function cancel(state: EvaluationState, reason: VoidReason): EvaluationState {
  if (!state.open) return state;
  // A voided cue was never scored, so it may be opened again once it returns.
  return { ...state, open: null, lastKey: null, voided: { ...state.voided, [reason]: state.voided[reason] + 1 } };
}

function openCue(state: EvaluationState, practice: PracticeState, nowMs: number): EvaluationState {
  const cue = promptKey(practice);
  if (state.open || !cue || cue.key === state.lastKey) return state;
  return { ...state, lastKey: cue.key,
    open: { key: cue.key, pose: practice.pose, target: cue.target, round: practice.round, openedMs: nowMs } };
}

const TRACKING_PAUSES = ['Tracking unavailable', 'Camera stopped'];

/** Cut off by an outside change rather than decided by the player. */
function voidReason(practice: PracticeState): VoidReason {
  if (practice.phase !== 'paused') return 'cueChanged';
  return TRACKING_PAUSES.includes(practice.pauseReason ?? '') ? 'tracking' : 'paused';
}

/**
 * @param prompted  guided practice as the player saw it this frame (before the frame's detections)
 * @param next      guided practice after this frame's detections
 * @param events    this frame's detections
 * @param isTracking whether practice tracking is valid this frame; detections are ignored otherwise
 */
export function updateEvaluation(state: EvaluationState, prompted: PracticeState, next: PracticeState,
  events: readonly PoseEvent[], isTracking: boolean, nowMs: number,
  config: EvaluationConfig = DEFAULT_CONFIG): EvaluationState {
  if (!isTracking) return cancel(state, 'tracking');
  let current = state;
  // The cue may have moved on between pose frames (a skip, a clock tick, a pause).
  if (current.open && promptKey(prompted)?.key !== current.open.key) current = cancel(current, voidReason(prompted));
  current = openCue(current, prompted, nowMs);
  if (current.open) {
    const scored = scoreEvents(current.open, events);
    if (scored) current = close(current, current.open, scored.outcome, nowMs, scored.event, config);
    else if (nowMs - current.open.openedMs >= config.attemptMs) current = close(current, current.open, 'missed', nowMs, null, config);
  }
  if (current.open && promptKey(next)?.key !== current.open.key) current = cancel(current, voidReason(next));
  return openCue(current, next, nowMs);
}

// ---------------------------------------------------------------- summaries

export interface RateInterval { value: number | null; low: number | null; high: number | null }

export interface PoseEvaluation {
  attempts: number;
  correct: number;
  errors: Record<AttemptError, number>;
  /** Which movement was recognised instead, for `otherMovement` errors. */
  otherByPose: Record<PoseId, number>;
  /** Share of attempts that were not correct, with its 95% Wilson interval. */
  errorRate: RateInterval;
  /** Error rate at or below `CONFIG.trial.maxErrorPercent`; null with no attempts. */
  passes: boolean | null;
  responseMeanMs: number | null;
  responseP95Ms: number | null;
}

export interface EvaluationSummary {
  byPose: Record<PoseId, PoseEvaluation>;
  overall: PoseEvaluation;
  voided: Record<VoidReason, number>;
  dropped: number;
}

const Z95 = 1.959964;

/** 95% Wilson score interval for `failures` out of `trials`. */
export function wilsonInterval(failures: number, trials: number): RateInterval {
  if (trials <= 0) return { value: null, low: null, high: null };
  const p = failures / trials;
  const z2 = Z95 * Z95;
  const centre = (p + z2 / (2 * trials)) / (1 + z2 / trials);
  const half = (Z95 * Math.sqrt(p * (1 - p) / trials + z2 / (4 * trials * trials))) / (1 + z2 / trials);
  return { value: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

function percentile95(sorted: readonly number[]): number | null {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]! : null;
}

export function summarizePose(attempts: readonly EvaluationAttempt[], maxErrorPercent = CONFIG.trial.maxErrorPercent): PoseEvaluation {
  const errors: Record<AttemptError, number> = { missed: 0, wrongLane: 0, wrongKnee: 0, otherMovement: 0 };
  const otherByPose: Record<PoseId, number> = { lateral: 0, knees: 0, hips: 0, clap: 0 };
  const responses: number[] = [];
  for (const attempt of attempts) {
    if (attempt.outcome === 'correct') {
      if (attempt.responseMs !== null) responses.push(attempt.responseMs);
      continue;
    }
    errors[attempt.outcome]++;
    if (attempt.outcome === 'otherMovement' && attempt.detected) otherByPose[attempt.detected.pose]++;
  }
  const correct = attempts.length - ATTEMPT_ERRORS.reduce((total, error) => total + errors[error], 0);
  const sorted = [...responses].sort((a, b) => a - b);
  const errorRate = wilsonInterval(attempts.length - correct, attempts.length);
  return { attempts: attempts.length, correct, errors, otherByPose, errorRate,
    passes: errorRate.value === null ? null : errorRate.value * 100 <= maxErrorPercent,
    responseMeanMs: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
    responseP95Ms: percentile95(sorted) };
}

export function summarizeEvaluation(state: EvaluationState): EvaluationSummary {
  return {
    byPose: Object.fromEntries(POSE_IDS.map(pose => [pose, summarizePose(state.attempts.filter(a => a.pose === pose))])) as Record<PoseId, PoseEvaluation>,
    overall: summarizePose(state.attempts),
    voided: state.voided,
    dropped: state.dropped,
  };
}
