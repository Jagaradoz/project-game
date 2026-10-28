import type { PracticeState } from '@/engine/core/practice';

export const POSE_TITLES = { lateral: 'Side steps', knees: 'Knee lifts', hips: 'Hands on Hips', clap: 'Overhead clap' };
export interface PracticeCue {
  title: string;
  detail: string;
  direction: 'left' | 'right' | 'centre' | 'up' | 'down' | 'apart' | null;
}

interface PracticeTracking {
  isCameraRunning: boolean;
  hasBody: boolean;
  kneesVisible: boolean;
  isCalibrated: boolean;
}

/** Body visibility takes priority over movement instructions. */
export function practiceTrackingCue(s: PracticeTracking): PracticeCue | null {
  if (!s.isCameraRunning) return { title: 'Enable Your Camera', detail: 'Allow camera access to begin body tracking.', direction: null };
  if (!s.hasBody) return { title: 'Body Not Detected', detail: 'Step into the camera view with your head and knees visible.', direction: null };
  if (!s.kneesVisible) return { title: 'Show Your Head and Knees', detail: 'Step back until your head and both knees are visible.', direction: null };
  if (!s.isCalibrated) return { title: 'Calibrating', detail: 'Stand still in the centre while we find your position.', direction: null };
  return null;
}

/** Present the detector's current target, rather than asking for an entire sequence. */
export function practiceCue(p: PracticeState, lane: 'LEFT' | 'CENTER' | 'RIGHT'): PracticeCue {
  if (p.phase === 'paused') return { title: 'Session Paused', detail: 'Get into position, then press Resume.', direction: null };
  if (p.phase === 'summary') return { title: 'Session Complete', detail: 'Your results are ready.', direction: null };
  if (p.phase === 'rest') return { title: 'Rest', detail: `Next round in ${Math.ceil(p.remainingPhaseMs / 1000)}s.`, direction: null };
  if (p.phase === 'complete') return { title: 'Pose Complete', detail: `Next pose in ${Math.ceil(p.remainingPhaseMs / 1000)}s.`, direction: null };
  if (p.phase === 'idle') return { title: 'Stand in the Centre', detail: 'Keep your head and knees in view.', direction: 'centre' };
  switch (p.pose) {
    case 'lateral': {
      if (p.laneStep === 'back' || (p.phase === 'ready' && lane !== 'CENTER')) {
        return { title: 'Return to Centre', detail: lane === 'LEFT' ? 'Move right to the middle.' : lane === 'RIGHT' ? 'Move left to the middle.' : 'Stand in the middle.', direction: lane === 'LEFT' ? 'right' : lane === 'RIGHT' ? 'left' : 'centre' };
      }
      const side = p.nextSide.toLowerCase() as 'left' | 'right';
      return { title: `Move ${p.nextSide === 'LEFT' ? 'Left' : 'Right'}`, detail: `Lean gently to your ${side}.`, direction: side };
    }
    case 'knees': return p.targetKnee
      ? { title: `Lift ${p.targetKnee === 'LEFT' ? 'Left' : 'Right'} Knee`, detail: 'Lift, then lower.', direction: 'up' }
      : { title: 'Lift Either Knee', detail: 'Keep the other foot on the floor.', direction: 'up' };
    case 'hips': return p.phase === 'ready'
      ? { title: 'Release Your Hands', detail: 'Lower both arms from your hips.', direction: 'down' }
      : { title: 'Hands on Hips', detail: 'Place both hands at your waist. Hold.', direction: null };
    case 'clap': return p.phase === 'ready'
      ? { title: 'Separate Your Hands', detail: 'Get ready to clap overhead.', direction: 'apart' }
      : { title: 'Clap Overhead', detail: 'Bring your hands together above your head.', direction: 'up' };
  }
}
