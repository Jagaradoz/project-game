'use client';

/* TOR 3: ระบบตารางคะแนน. */

import { ChartColumn, Map, Medal, User } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { AccountTabs } from '@/components/account/AccountTabs';
import { PageShell } from '@/components/ui/PageShell';
import { getErrorMessage, repository } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import type { LeaderboardEntry } from '@/types/api';

/** Bronze, silver and gold, for the top three rows only. */
const MEDAL_CLASS: Record<number, string> = {
  1: 'text-[#facc15]',
  2: 'text-[#cbd5e1]',
  3: 'text-[#d97706]',
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    repository
      .getLeaderboard()
      .then((result) => {
        if (isActive) setEntries(result);
      })
      .catch((cause: unknown) => {
        if (isActive) setError(getErrorMessage(cause));
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <PageShell
      title="Leaderboard"
      subtitle="The highest scores recorded, by display name."
      width="wide"
      actions={
        <LinkButton href="/stages" variant="primary" icon={<Map size={18} />}>
          Play for a score
        </LinkButton>
      }
    >
      <AccountTabs />

      <Notice tone="info">
        This table shows only the <strong>display name</strong> each player has chosen — never an
        email address or a real name. You can change yours on the edit profile page.
      </Notice>

      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        {!entries ? (
          <p className="m-0 text-sm text-muted">Loading the leaderboard…</p>
        ) : entries.length === 0 ? (
          <EmptyState
            title="No scores recorded yet"
            icon={<ChartColumn size={22} />}
            action={
              <LinkButton href="/stages" variant="primary" icon={<Map size={18} />}>
                Play a run
              </LinkButton>
            }
          >
            Finish a run and your score will appear here.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Highest player scores, ranked</caption>
              <thead>
                <tr className="text-left text-xs tracking-[0.08em] text-muted uppercase">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Rank
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Player
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">
                    Score
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold whitespace-nowrap">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={`${entry.rank}-${entry.displayName}`}
                    className={`border-t border-line ${
                      entry.isCurrentUser ? 'bg-primary-soft text-primary' : ''
                    }`}
                  >
                    <td className="py-3 pr-3 tabular-nums">
                      <span className="flex items-center gap-1.5">
                        {MEDAL_CLASS[entry.rank] && (
                          <Medal aria-hidden size={16} className={MEDAL_CLASS[entry.rank]} />
                        )}
                        {entry.rank}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-semibold">
                      <span className="flex items-center gap-2">
                        {entry.isCurrentUser && <User aria-hidden size={15} />}
                        {entry.displayName}
                        {entry.isCurrentUser && (
                          <span className="text-xs font-normal">(you)</span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {formatNumber(entry.score)}
                    </td>
                    <td className="py-3 text-right whitespace-nowrap text-muted">
                      {formatDate(entry.recordedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* "Play for a score" already sits beside the heading; repeating it here
          would put the same label on screen twice. */}
      <LinkButton href="/profile" icon={<User size={18} />} className="self-start">
        View my statistics
      </LinkButton>
    </PageShell>
  );
}
