import Link from 'next/link';

import { VersionTag } from '@/components/ui/VersionTag';

interface NavLink {
  href: string;
  label: string;
}

/** Every route in the TOR screen list, in the order a player meets them. */
const GAME_NAV: NavLink[] = [
  { href: '/', label: 'หน้าแรก' },
  { href: '/how-to-play', label: 'วิธีเล่น' },
  { href: '/calibrate', label: 'ปรับเทียบกล้อง' },
  { href: '/stages', label: 'เลือกด่าน' },
  { href: '/play', label: 'เล่นเกม' },
  { href: '/profile', label: 'โปรไฟล์' },
  { href: '/leaderboard', label: 'ตารางคะแนน' },
];

/**
 * The control group's nav.
 *
 * TOR 3 puts the control condition through the same movements with no game
 * elements, so the chrome has to honour that too: a link reading "ตารางคะแนน"
 * or "เลือกด่าน" is a game element on screen, and it would leak the very
 * variable the comparison in Proposal 9.3 is trying to isolate.
 */
const STUDY_NAV: NavLink[] = [{ href: '/consent', label: 'คำชี้แจงและความยินยอม' }];

export type NavVariant = 'game' | 'study';

interface PageShellProps {
  title: string;
  /** The TOR clause this screen satisfies. Useful during review; harmless after. */
  tor?: string;
  /** 'study' strips every game affordance from the chrome. See STUDY_NAV. */
  nav?: NavVariant;
  children?: React.ReactNode;
}

export function PageShell({ title, tor, nav = 'game', children }: PageShellProps) {
  const links = nav === 'study' ? STUDY_NAV : GAME_NAV;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col gap-4 p-4">
      <nav aria-label="เมนูหลัก" className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-accent">
            {link.label}
          </Link>
        ))}
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold">{title}</h1>
        {tor && <p className="m-0 text-[13px] text-muted">{tor}</p>}
      </header>

      {children}

      <VersionTag />
    </main>
  );
}
