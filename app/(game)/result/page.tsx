'use client';

/* TOR 3: หน้าสรุปผลหลังเล่น -- the post-run summary. */

import {
  Activity,
  ChartColumn,
  Footprints,
  House,
  Map,
  Route,
  RotateCcw,
  Swords,
  Timer,
  Trophy,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { getErrorMessage, repository } from '@/lib/api';
import { biomeName } from '@/lib/api/catalog';
import { formatDelta, formatDuration, formatMetres, formatNumber } from '@/lib/format';
import { useRunStore } from '@/lib/store/run';
import type { ProfileSummary, RunResult } from '@/types/api';

export default function ResultPage() {
  const lastRun = useRunStore((state) => state.lastRun);

  const [run, setRun] = useState<RunResult | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    repository
      .getProfile()
      .then((result) => {
        if (!isActive) return;
        setProfile(result);
        // The store is not persisted, so opening /result directly -- or
        // reloading it -- finds it empty. Falling back to the most recent
        // stored run is the honest answer, and it is the same run.
        setRun(lastRun ?? result.recentRuns[0] ?? null);
      })
      .catch((cause: unknown) => {
        if (isActive) setError(getErrorMessage(cause));
      });

    return () => {
      isActive = false;
    };
  }, [lastRun]);

  return (
    <PageShell
      eyebrow="After the run"
      title="Run Summary"
      subtitle="How this run went, and how it compares with your own history."
      width="wide"
    >
      {error && <Notice tone="error">{error}</Notice>}

      {!run ? (
        <EmptyState
          title="No runs yet"
          icon={<ChartColumn size={22} />}
          action={
            <LinkButton href="/characters" variant="primary" icon={<Map size={18} />}>
              Start training
            </LinkButton>
          }
        >
          Finish a run and your results will show up here.
        </EmptyState>
      ) : (
        <>
          <Notice
            tone={run.isCleared ? 'ok' : 'info'}
            title={run.isCleared ? 'Training cleared' : 'Run complete'}
          >
            {biomeName(run.biomeId)} &middot; Training &mdash; {formatNumber(run.enemiesKilled)} enemies
            defeated before the run ended. Go again whenever you like.
          </Notice>

          <Card title="This run" icon={<Trophy size={20} />}>
            <StatGrid>
              <StatTile
                label="Score"
                icon={<Trophy size={16} />}
                value={formatNumber(run.score)}
                isHighlighted
              />
              <StatTile
                label="Enemies defeated"
                icon={<Swords size={16} />}
                value={formatNumber(run.enemiesKilled)}
              />
              <StatTile
                label="Session length"
                icon={<Timer size={16} />}
                value={formatDuration(run.durationMs)}
              />
              <StatTile
                label="Movements"
                icon={<Footprints size={16} />}
                value={formatNumber(run.movementCount)}
                detail="Detected by the system, not an energy figure"
              />
              <StatTile
                label="Distance"
                icon={<Route size={16} />}
                value={formatMetres(run.distanceM)}
              />
            </StatGrid>
          </Card>

          {profile && <ComparisonCard run={run} profile={profile} />}

          <div className="flex flex-col gap-3 sm:flex-row">
            <LinkButton
              href="/characters"
              variant="primary"
              icon={<RotateCcw size={18} />}
              className="flex-1"
            >
              Play again
            </LinkButton>
            <LinkButton href="/" icon={<House size={18} />} className="flex-1">
              Home
            </LinkButton>
          </div>
        </>
      )}
    </PageShell>
  );
}

/**
 * TOR 3: comparison against the player's own history.
 *
 * Deliberately self-comparison, not a comparison against other players --
 * Alsawaier (2018) on self-competition, cited in Proposal 6, and it keeps the
 * pressure down per TOR 5.1.
 */
function ComparisonCard({ run, profile }: { run: RunResult; profile: ProfileSummary }) {
  const previous = profile.recentRuns.find(
    (entry) =>
      entry.id !== run.id && entry.biomeId === run.biomeId && entry.stageNumber === run.stageNumber,
  );

  const isPersonalBest = run.score >= profile.stats.bestScore && profile.stats.totalRuns > 0;

  return (
    <Card title="Compared with your own record" icon={<ChartColumn size={20} />}>
      {isPersonalBest && (
        <p className="m-0 flex items-center gap-2 font-semibold text-ok-text">
          <Trophy aria-hidden size={18} />
          New personal best
        </p>
      )}

      <StatGrid>
        <StatTile label="Your best score" value={formatNumber(profile.stats.bestScore)} />
        <StatTile label="Runs played" value={formatNumber(profile.stats.totalRuns)} />
        {previous ? (
          <>
            <StatTile
              label="Score vs last time"
              icon={<Trophy size={16} />}
              value={formatDelta(run.score - previous.score)}
              detail={`Last time: ${formatNumber(previous.score)} points`}
            />
            <StatTile
              label="Movement vs last time"
              icon={<Activity size={16} />}
              value={formatDelta(run.movementCount - previous.movementCount)}
              detail={`Last time: ${formatNumber(previous.movementCount)}`}
            />
          </>
        ) : (
          <StatTile
            label="Compared with last time"
            value="--"
            detail="This is your first run on this stage"
          />
        )}
      </StatGrid>
    </Card>
  );
}
