import Link from 'next/link';

import { VersionTag } from '@/components/ui/VersionTag';
import { SHELL_GUTTER, SHELL_WIDTH } from '@/components/layout/container';
import { Wordmark } from '@/components/layout/Wordmark';

const FOOTER_LINKS = [
  { href: '/how-to-play', label: 'How to Play' },
  { href: '/calibrate', label: 'Calibrate' },
  { href: '/consent', label: 'Information & Consent' },
];

interface SiteFooterProps {
  /** The control group's chrome carries no links to game screens. See nav.ts. */
  hasLinks?: boolean;
  /** Play already fills the viewport; a short strip is enough. */
  compact?: boolean;
}

export function SiteFooter({ hasLinks = true, compact = false }: SiteFooterProps) {
  if (compact) {
    return (
      <footer className="mt-auto border-t border-line bg-bg">
        <div
          className={`mx-auto flex ${SHELL_WIDTH.wide} flex-wrap items-center justify-between gap-3 py-4 ${SHELL_GUTTER}`}
        >
          <p className="m-0 text-xs text-subtle">
            Pose detection stays in this browser. Stop if you feel unwell.
          </p>
          <VersionTag />
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className={`mx-auto flex ${SHELL_WIDTH.wide} flex-col gap-6 py-8 ${SHELL_GUTTER}`}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex max-w-sm flex-col gap-2">
            <Wordmark />
            <p className="m-0 text-sm text-muted">
              A webcam exercise game. Pose detection runs entirely in your browser.
            </p>
          </div>

          {hasLinks && (
            <nav aria-label="Footer" className="flex flex-col gap-2">
              {FOOTER_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted no-underline transition-colors hover:text-text"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <p className="m-0 border-t border-line pt-5 text-xs leading-relaxed text-subtle">
          Trail Runner is not a medical device and is not intended to diagnose, treat or monitor any
          condition. Movement counts are what the system detects, not a clinically validated measure
          of energy expenditure. Stop immediately if you feel dizzy, short of breath or unwell, and
          consult a doctor before exercising if you have a pre-existing condition.
        </p>

        <VersionTag />
      </div>
    </footer>
  );
}
