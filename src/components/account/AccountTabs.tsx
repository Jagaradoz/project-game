'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChartColumn, User } from 'lucide-react';

const TABS = [
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/leaderboard', label: 'Leaderboard', icon: ChartColumn },
];

/**
 * Profile and Leaderboard are two views of the same thing -- your standing --
 * so they share a tab strip instead of two header slots.
 *
 * This is the ONLY inbound link to /leaderboard now that the header no longer
 * carries a labelled Profile item. Removing it orphans the route.
 */
export function AccountTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account views" className="flex gap-1 rounded-md border border-line bg-surface p-1">
      {TABS.map((tab) => {
        // /profile/edit is still the Profile tab, so this is a prefix match.
        const isActive = pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold no-underline transition-colors ${
              isActive
                ? 'bg-elevated text-text'
                : 'text-muted hover:bg-elevated/60 hover:text-text'
            }`}
          >
            <tab.icon aria-hidden size={16} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
