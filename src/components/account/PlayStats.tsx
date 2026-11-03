'use client';

import { useRouter } from 'next/navigation';
import { History } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { fetchPlays, type ApiResult } from '@/lib/api/account';
import { formatDuration, formatMetres, formatNumber } from '@/lib/format';
import type { PlaysData } from '@/server/accounts';

/** Day, month and time only: the year costs a phone-width column and is almost always this one. */
const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function PlayStats() {
  const router = useRouter();
  const [result, setResult] = useState<ApiResult<PlaysData> | null>(null);

  useEffect(() => {
    let isCancelled = false;
    void fetchPlays().then((next) => {
      if (isCancelled) return;
      if (next.status === 401) router.replace('/login?next=/stats');
      else setResult(next);
    });
    return () => { isCancelled = true; };
  }, [router]);

  if (!result) return <p className="m-0 text-sm text-muted">Loading your stats…</p>;
  if (!result.ok) return <Notice tone="error" title="Could not load your stats">{result.error}</Notice>;

  const { summary, recent } = result.data;
  return <>
    <Card title="All time"><StatGrid>
      <StatTile label="Runs" value={formatNumber(summary.runs)} isHighlighted />
      <StatTile label="Best score" value={formatNumber(summary.bestScore)} />
      <StatTile label="Best distance" value={formatMetres(summary.bestDistanceM)} />
      <StatTile label="Total play time" value={formatDuration(summary.totalDurationMs)} />
    </StatGrid></Card>

    <Card title="Recent runs" icon={<History size={18} />} note="Newest first">
      {recent.length === 0
        ? <EmptyState title="No runs yet" action={<LinkButton href="/play" variant="primary">Start Game Mode</LinkButton>}>
            Finish a Game Mode run and it shows up here.
          </EmptyState>
        : <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead>
                <tr className="border-b-2 border-ink text-left">
                  {['Date', 'Score', 'Distance', 'Time'].map((heading) => (
                    <th key={heading} scope="col" className="eyebrow px-1.5 py-2 sm:px-2 text-[11px] tracking-[0.1em]">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((play, index) => (
                  <tr key={`${play.playedAt}-${index}`} className="border-b border-ink/20 last:border-b-0">
                    <td className="px-1.5 py-2.5 sm:px-2 whitespace-nowrap">{DATE_FORMAT.format(play.playedAt)}</td>
                    <td className="px-1.5 py-2.5 sm:px-2 font-semibold">{formatNumber(play.score)}</td>
                    <td className="px-1.5 py-2.5 sm:px-2">{formatMetres(play.distanceM)}</td>
                    <td className="px-1.5 py-2.5 sm:px-2">{formatDuration(play.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
    </Card>
  </>;
}
