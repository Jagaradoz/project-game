'use client';

/**
 * TOR 3: the control-group condition. Gated on /consent, because this screen is
 * the one that exists to collect study data.
 */

import dynamic from 'next/dynamic';

import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { useHydrated } from '@/hooks/useHydrated';
import { useConsent } from '@/lib/store/consent';

const PracticePanel = dynamic(() => import('@/components/game/PracticePanel'), {
  ssr: false,
  loading: () => <p className="m-0 text-sm text-muted">กำลังเตรียมระบบตรวจจับ...</p>,
});

export default function PracticePage() {
  const acceptedAt = useConsent((state) => state.acceptedAt);

  // Persisted state hydrates after the first client render, so waiting on the
  // store avoids flashing the consent gate at someone who has already consented.
  const isReady = useHydrated(useConsent);

  return (
    <PageShell
      title="โหมดเคลื่อนไหว (กลุ่มควบคุม)"
      tor="TOR 3: การประเมินแรงจูงใจ — กิจกรรมการเคลื่อนไหวแบบเดียวกัน โดยไม่มีองค์ประกอบของเกม"
      // The chrome is stripped too: a nav link to the leaderboard or the stage
      // list would put a game element in front of the control group.
      nav="study"
    >
      <p className="m-0 text-sm leading-relaxed text-muted">
        โหมดนี้ใช้ระบบตรวจจับท่าทางชุดเดียวกับเกม และนับจำนวนการเคลื่อนไหวแบบเดียวกัน
        แต่ไม่มีตัวละคร ศัตรู คะแนน หรือด่าน
      </p>

      {!isReady ? null : acceptedAt ? (
        <PracticePanel />
      ) : (
        <>
          <Notice tone="warn" title="ต้องให้ความยินยอมก่อน">
            โหมดนี้เป็นส่วนหนึ่งของการเก็บข้อมูลวิจัย
            กรุณาอ่านคำชี้แจงและให้ความยินยอมก่อนเริ่มใช้งาน
          </Notice>
          <LinkButton href="/consent" variant="primary" className="self-start">
            อ่านคำชี้แจงและให้ความยินยอม
          </LinkButton>
        </>
      )}
    </PageShell>
  );
}
