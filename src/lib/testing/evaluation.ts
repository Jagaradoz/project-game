export interface AccuracyTrial { correct: number; missed: number; incorrect: number }
export type MovementId = 'lateral' | 'knees' | 'hips' | 'clap';
export const MOVEMENTS: { id: MovementId; title: string; instruction: string; effect: string }[] = [
  { id: 'lateral', title: 'Move left / centre / right', instruction: 'Stand upright. Gently shift your torso left, return to centre, then right. Keep your balance.', effect: 'Switch between three lanes' },
  { id: 'knees', title: 'Alternate knee lifts', instruction: 'Lift your knees alternately at a comfortable, gentle pace. Small lifts are enough. Stop to rest.', effect: 'One projectile per step; speed follows your cadence' },
  { id: 'hips', title: 'Hands on hips', instruction: 'Place both hands at your waist, elbows out. Breathe normally and hold without locking your knees.', effect: 'Hold a shield against poison fog' },
  { id: 'clap', title: 'Clap overhead', instruction: 'Separate your hands, raise them above your head and clap. Separate them before repeating. You do not need to jump.', effect: 'Make the character jump' },
];
export function accuracyResult(trial: AccuracyTrial) {
  const attempts = trial.correct + trial.missed + trial.incorrect;
  const percent = attempts ? trial.correct / attempts * 100 : null;
  return { attempts, percent, passes: attempts === 10 && percent !== null && percent >= 90 };
}
export function countingError(detected: number, actual: number): number | null {
  return actual > 0 && Number.isFinite(actual) && Number.isFinite(detected) ? Math.abs(detected - actual) / actual * 100 : null;
}
