import type { PracticeState } from '@/engine/core/practice';

export const POSE_TITLES = { lateral: 'Side steps', knees: 'Knee lifts', hips: 'Hands on hips', clap: 'Overhead clap' };
export interface PracticeCue {
  title: string;
  detail: string;
  direction: 'left' | 'right' | 'centre' | 'up' | 'down' | 'apart' | null;
}

/** Present the detector's current target, rather than asking for an entire sequence. */
export function practiceCue(p: PracticeState, lane: 'LEFT' | 'CENTER' | 'RIGHT'): PracticeCue {
  if (p.phase === 'paused') return { title: 'Session paused', detail: 'Get into position, then press Resume.', direction: null };
  if (p.phase === 'summary') return { title: 'Session complete', detail: 'Your results are ready.', direction: null };
  if (p.phase === 'rest') return { title: 'Rest', detail: `Next round in ${Math.ceil(p.remainingPhaseMs / 1000)}s.`, direction: null };
  if (p.phase === 'complete') return { title: 'Pose complete', detail: `Next pose in ${Math.ceil(p.remainingPhaseMs / 1000)}s.`, direction: null };
  if (p.phase === 'idle') return { title: 'Stand in the centre', detail: 'Keep your head and knees in view.', direction: 'centre' };
  switch (p.pose) {
    case 'lateral': {
      if (p.laneStep === 'back' || (p.phase === 'ready' && lane !== 'CENTER')) {
        return { title: 'Return to centre', detail: lane === 'LEFT' ? 'Move right to the middle.' : lane === 'RIGHT' ? 'Move left to the middle.' : 'Stand in the middle.', direction: lane === 'LEFT' ? 'right' : lane === 'RIGHT' ? 'left' : 'centre' };
      }
      const side = p.nextSide.toLowerCase() as 'left' | 'right';
      return { title: `Move ${side}`, detail: `Lean gently to your ${side}.`, direction: side };
    }
    case 'knees': return p.targetKnee
      ? { title: `Lift your ${p.targetKnee.toLowerCase()} knee`, detail: 'Lift, then lower.', direction: 'up' }
      : { title: 'Lift either knee', detail: 'Keep the other foot on the floor.', direction: 'up' };
    case 'hips': return p.phase === 'ready'
      ? { title: 'Release your hands', detail: 'Lower both arms from your hips.', direction: 'down' }
      : { title: 'Hands on hips', detail: 'Place both hands at your waist. Hold.', direction: null };
    case 'clap': return p.phase === 'ready'
      ? { title: 'Separate your hands', detail: 'Get ready to clap overhead.', direction: 'apart' }
      : { title: 'Clap overhead', detail: 'Bring your hands together above your head.', direction: 'up' };
  }
}
