'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Play, Trophy } from 'lucide-react';
import { RunGrid } from '@/components/account/RunGrid';
import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { getErrorMessage, repository } from '@/lib/api';
import { formatDuration, formatNumber } from '@/lib/format';
import type { ProfileSummary } from '@/types/api';

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    repository.getProfile()
      .then((result) => { if (active) setProfile(result); })
      .catch((cause: unknown) => { if (active) setError(getErrorMessage(cause)); });
    return () => { active = false; };
  }, []);

  return (
    <PageShell title="Profile" eyebrow="This visit" width="wide"
      subtitle="Your play history, accumulated statistics, and personal high scores."
      actions={<LinkButton href="/play" variant="primary" icon={<Play size={16} />}>Game Mode</LinkButton>}>
      <Notice tone="info" title="Kept only for this visit">
        Results and settings stay in memory while you navigate. Reloading or closing this page clears them.
        There is no account and nothing is saved to browser storage.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {!profile ? <p className="m-0 text-sm text-muted">Loading this visit…</p> : (
        <>
          <dl className="m-0 grid grid-cols-2 gap-4 border-2 border-ink bg-surface p-5 sm:grid-cols-3">
            {[
              ['Runs', formatNumber(profile.stats.totalRuns)],
              ['Best score', formatNumber(profile.stats.bestScore)],
              ['Gameplay time', formatDuration(profile.stats.totalDurationMs)],
              ['Detected movements', formatNumber(profile.stats.totalMovementCount)],
              ['Knee steps', formatNumber(profile.stats.totalSteps)],
              ['Enemies defeated', formatNumber(profile.stats.totalEnemiesKilled)],
            ].map(([label, value]) => (
              <div key={label}><dt className="text-xs text-muted">{label}</dt>
                <dd className="m-0 text-xl font-black tabular-nums">{value}</dd></div>
            ))}
          </dl>
          <Card title="Personal high scores" icon={<Trophy size={20} />}>
            {profile.recentRuns.length === 0 ? <p className="m-0 text-sm text-muted">Finish a session to set your first score.</p> : (
              <ol className="m-0 flex list-decimal flex-col gap-2 pl-5">
                {[...profile.recentRuns].sort((a, b) => b.score - a.score).slice(0, 5).map((run) => (
                  <li key={run.id}>
                    <Link href={`/result?run=${encodeURIComponent(run.id)}`} className="font-bold text-text underline underline-offset-4">
                      {formatNumber(run.score)} points
                    </Link>
                    <span className="ml-2 text-sm text-muted">{formatDuration(run.durationMs)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <div className="flex flex-col gap-4">
            <h2 className="m-0 text-xl font-black">Visit history</h2>
            <RunGrid runs={profile.recentRuns} />
          </div>
          <p className="m-0 text-xs text-muted">Movements and steps are detections, not a clinically validated energy measure.</p>
        </>
      )}
    </PageShell>
  );
}
