'use client';

/**
 * Study consent, per TOR 3 (การจัดการข้อมูลผู้เข้าร่วมทดลอง):
 * ชี้แจงรายละเอียดและขอความยินยอมก่อนเก็บข้อมูล.
 *
 * Persisted, because consent given once should not be asked for again on every
 * visit. It gates /practice -- the control-group mode -- and it is revocable:
 * a participant can withdraw, and the UI must let them.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ConsentState {
  /** ISO timestamp of when consent was given, or null. */
  acceptedAt: string | null;
  accept: () => void;
  withdraw: () => void;
}

export const useConsent = create<ConsentState>()(
  persist(
    (set) => ({
      acceptedAt: null,
      accept: () => set({ acceptedAt: new Date().toISOString() }),
      withdraw: () => set({ acceptedAt: null }),
    }),
    { name: 'trail_runner_consent_v1' },
  ),
);
