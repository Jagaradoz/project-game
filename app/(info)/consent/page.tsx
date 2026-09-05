'use client';

/**
 * TOR 3 (การจัดการข้อมูลผู้เข้าร่วมทดลอง): the participant information sheet and
 * the consent it asks for before any study data is collected.
 *
 * A client component because consent is a decision made here and stored here.
 * It gates /practice, the control-group mode, and stays revocable -- a
 * participant who withdraws must be able to say so without asking anyone.
 */

import { Ban, Check, FlaskConical, Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { Button, LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { useHydrated } from '@/hooks/useHydrated';
import { formatDateTime } from '@/lib/format';
import { useConsent } from '@/lib/store/consent';

const COLLECTED = [
  'Score, enemies defeated, session length and in-game distance',
  'The number of movements detected, and how long you kept moving',
  'Which biome and stage you played, and the difficulty you chose',
  'Technical measurements such as frame rate and detection latency',
];

const NOT_COLLECTED = [
  'Images or video from your camera — these never leave your browser and are never stored',
  'Per-frame body joint positions — processed on your device and discarded immediately',
  'Any identifying information beyond what you enter yourself when registering',
];

export default function ConsentPage() {
  const acceptedAt = useConsent((state) => state.acceptedAt);
  const accept = useConsent((state) => state.accept);
  const withdraw = useConsent((state) => state.withdraw);

  const [isChecked, setIsChecked] = useState(false);

  // The store is persisted, so its first client render does not match the
  // server's. Wait for its own hydration event rather than a state flip.
  const isReady = useHydrated(useConsent);

  return (
    <PageShell
      title="Information & Consent"
      subtitle="What this study collects, what it does not, and what agreeing to take part means."
      width="wide"
    >
      <Card title="About this study" icon={<FlaskConical size={20} />}>
        <p className="m-0 max-w-3xl text-sm leading-relaxed text-muted">
          This project studies how game elements — enemies, scoring and difficulty — affect intrinsic
          motivation and how consistently players keep moving. Participants are split into two
          groups: one plays the complete game, and the other performs the same movements through the
          same detection system without any game elements. Taking part is voluntary, and you can stop
          at any time without giving a reason.
        </p>
      </Card>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <Card title="What is collected" icon={<Check size={20} />}>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm text-muted">
            {COLLECTED.map((item) => (
              <li key={item} className="flex gap-2.5">
                <Check aria-hidden size={16} className="mt-0.5 flex-none text-ok" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="What is never collected" icon={<Ban size={20} />}>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm text-muted">
            {NOT_COLLECTED.map((item) => (
              <li key={item} className="flex gap-2.5">
                <Ban aria-hidden size={16} className="mt-0.5 flex-none text-danger" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Notice tone="info" title="How the data is used">
        Results are analysed under a participant code rather than a name, and reported only as
        aggregate statistics — no individual results are published. Access is limited to the project
        author and the supervising lecturer.
      </Notice>

      {!isReady ? null : acceptedAt ? (
        <>
          <Notice tone="ok" title="You have given consent">
            Recorded on {formatDateTime(acceptedAt)}.
          </Notice>

          <div className="flex flex-col gap-3 sm:flex-row">
            <LinkButton
              href="/practice"
              variant="primary"
              icon={<ShieldCheck size={18} />}
              className="flex-[1_1_200px]"
            >
              Go to movement mode
            </LinkButton>
            <Button variant="secondary" className="flex-[1_1_200px]" onClick={withdraw}>
              Withdraw consent
            </Button>
          </div>
        </>
      ) : (
        <Card title="Your consent" icon={<Lock size={20} />}>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-elevated p-4 text-sm leading-relaxed text-text">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(event) => setIsChecked(event.target.checked)}
              className="mt-0.5 size-5 flex-none accent-[var(--color-primary)]"
            />
            <span>
              I have read and understood the information above, and I agree to my gameplay results
              and movement data being collected for use in this study.
            </span>
          </label>

          <Button onClick={accept} disabled={!isChecked} isFullWidth icon={<Check size={18} />}>
            Agree and take part
          </Button>

          <p className="m-0 text-xs text-muted">
            If you do not agree you can still play the game as normal — you simply will not be part
            of the research data collection.
          </p>
        </Card>
      )}
    </PageShell>
  );
}
