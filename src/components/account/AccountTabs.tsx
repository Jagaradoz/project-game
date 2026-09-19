'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ChartColumn, LayoutGrid, Map, type LucideIcon } from 'lucide-react';

interface AccountTab {
  href: string;
  label: string;
  icon: LucideIcon;
}

const TABS: readonly AccountTab[] = [
  { href: '/profile', label: 'Runs', icon: LayoutGrid },
  { href: '/profile?tab=progress', label: 'Progress', icon: Map },
  { href: '/leaderboard', label: 'Leaderboard', icon: ChartColumn },
];

/**
 * Runs, Progress and Leaderboard are views of the same standing, so they share
 * a tab strip instead of three header slots.
 *
 * This is the ONLY inbound link to /leaderboard now that the header no longer
 * carries a labelled Profile item. Removing it orphans the route.
 */
export function AccountTabs() {
  return (
    <Suspense fallback={<AccountTabStrip />}>
      <AccountTabStripActive />
    </Suspense>
  );
}

function AccountTabStripActive() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const profileTab = searchParams.get('tab');

  return (
    <AccountTabStrip
      activeHref={activeTabHref(pathname, profileTab)}
    />
  );
}

function activeTabHref(pathname: string, profileTab: string | null): string {
  if (pathname.startsWith('/leaderboard')) return '/leaderboard';
  if (pathname === '/profile' && profileTab === 'progress') return '/profile?tab=progress';
  if (pathname === '/profile') return '/profile';
  return '';
}

function AccountTabStrip({ activeHref = '' }: { activeHref?: string }) {
  return (
    <nav aria-label="Account views" className="flex border-b border-line">
      {TABS.map((tab) => {
        const isActive = activeHref === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 px-3 text-xs font-semibold no-underline transition-colors ${
              isActive
                ? 'border-b-2 border-primary text-text'
                : 'border-b-2 border-transparent text-muted hover:text-text'
            }`}
          >
            <tab.icon aria-hidden size={18} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
