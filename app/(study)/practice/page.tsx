'use client';

/**
 * TOR 3: the control-group condition. Gated on /consent, because this screen is
 * the one that exists to collect study data.
 */

import dynamic from 'next/dynamic';
import { LoaderCircle, ShieldCheck } from 'lucide-react';

import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { useHydrated } from '@/hooks/useHydrated';
import { useConsent } from '@/lib/store/consent';

const PracticePanel = dynamic(() => import('@/components/game/PracticePanel'), {
  ssr: false,
  loading: () => (
    <p className="m-0 flex items-center gap-2 text-sm text-muted">
      <LoaderCircle aria-hidden size={16} className="animate-spin" />
      Preparing the detection system…
    </p>
  ),
});

export default function PracticePage() {
  const acceptedAt = useConsent((state) => state.acceptedAt);

  // Persisted state hydrates after the first client render, so waiting on the
  // store avoids flashing the consent gate at someone who has already consented.
  const isReady = useHydrated(useConsent);

  return (
    <PageShell
      title="Movement Mode"
      subtitle="The same movement activity, recorded through the same detection system, with no game elements."
      width="wide"
      // The chrome is stripped too: a nav link to the leaderboard or the stage
      // list would put a game element in front of the control group.
      nav="study"
    >
      <p className="m-0 max-w-3xl leading-relaxed text-muted">
        This mode uses the same pose detection as the game and counts movement the same way, but
        there is no character, no opponent, no score and no stage.
      </p>

      {!isReady ? null : acceptedAt ? (
        <PracticePanel />
      ) : (
        <>
          <Notice tone="warn" title="Consent is required first">
            This mode is part of the research data collection. Please read the information sheet and
            give your consent before starting.
          </Notice>
          <LinkButton
            href="/consent"
            variant="primary"
            icon={<ShieldCheck size={18} />}
            className="self-start"
          >
            Read the information sheet
          </LinkButton>
        </>
      )}
    </PageShell>
  );
}
