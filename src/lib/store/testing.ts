'use client';
import { create } from 'zustand';
import type { AccuracyTrial, MovementId } from '@/lib/testing/evaluation';
export type Pace = 'slow' | 'medium' | 'fast';
export interface CadenceTrial { detected: number; actual: string; meanSpeed: number; followed: boolean; stopped: boolean }
interface TestingState {
  accuracy: Record<MovementId, AccuracyTrial>;
  stillness: number | null;
  cadence: Partial<Record<Pace, CadenceTrial>>;
  notes: { device: string; browser: string; lighting: string; distance: string };
  score: (id: MovementId, outcome: keyof AccuracyTrial) => void;
  resetAccuracy: (id: MovementId) => void;
  setStillness: (count: number) => void;
  setCadence: (pace: Pace, trial: CadenceTrial) => void;
  updateCadence: (pace: Pace, patch: Partial<CadenceTrial>) => void;
  setNote: (field: keyof TestingState['notes'], text: string) => void;
}
const empty = (): AccuracyTrial => ({ correct: 0, missed: 0, incorrect: 0 });
export const useTestingStore = create<TestingState>()((set) => ({
  accuracy: { lateral: empty(), knees: empty(), hips: empty(), clap: empty() }, stillness: null, cadence: {},
  notes: { device: '', browser: '', lighting: '', distance: '' },
  score: (id, outcome) => set(s => {
    const trial = s.accuracy[id];
    if (trial.correct + trial.missed + trial.incorrect >= 10) return s;
    return { accuracy: { ...s.accuracy, [id]: { ...trial, [outcome]: trial[outcome] + 1 } } };
  }),
  resetAccuracy: id => set(s => ({ accuracy: { ...s.accuracy, [id]: empty() } })),
  setStillness: stillness => set({ stillness }),
  setCadence: (pace, trial) => set(s => ({ cadence: { ...s.cadence, [pace]: trial } })),
  updateCadence: (pace, patch) => set(s => ({ cadence: s.cadence[pace] ? { ...s.cadence, [pace]: { ...s.cadence[pace]!, ...patch } } : s.cadence })),
  setNote: (field, text) => set(s => ({ notes: { ...s.notes, [field]: text } })),
}));
