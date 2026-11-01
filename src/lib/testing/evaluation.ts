import { CONFIG } from '@/engine/config';
import { tallyAttempts, type PoseId, type TrialTally } from '@/engine/core/trial';

export type MovementId = PoseId;
export const MOVEMENTS: { id: MovementId; title: string; instruction: string; effect: string }[] = [
  { id: 'lateral', title: 'Move left / centre / right', instruction: 'Stand upright. Gently shift your torso to the side the guide shows, then return to centre. Keep your balance.', effect: 'Switch between three lanes' },
  { id: 'knees', title: 'Alternate knee lifts', instruction: 'Lift your knees alternately at a comfortable, gentle pace. Small lifts are enough. Stop to rest.', effect: 'One projectile per step; speed follows your cadence' },
  { id: 'hips', title: 'Hands on hips', instruction: 'Place both hands at your waist, elbows out. Breathe normally and hold without locking your knees.', effect: 'Hold a shield against poison fog' },
  { id: 'clap', title: 'Clap overhead', instruction: 'Separate your hands, raise them above your head and clap. Separate them before repeating. You do not need to jump.', effect: 'Make the character jump' },
];

/** Error rate = (missed + wrong) / attempts. Passes only on a complete trial. */
export function trialResult(tally: TrialTally) {
  const attempts = tallyAttempts(tally);
  const errorPercent = attempts ? (tally.missed + tally.incorrect) / attempts * 100 : null;
  const isComplete = attempts >= CONFIG.trial.attempts;
  return { attempts, errorPercent, isComplete, passes: isComplete && errorPercent !== null && errorPercent <= CONFIG.trial.maxErrorPercent };
}
