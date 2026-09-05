'use client';

/* TOR 3: หน้าโปรไฟล์ผู้เล่น -- accumulated stats and play history. */

import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  ChartColumn,
  Lock,
  LogOut,
  Map,
  Pencil,
  Swords,
  Timer,
  Trophy,
  UserPlus,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { LinkButton, Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { StageStrip } from '@/components/ui/ProgressBar';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { difficultyLabel } from '@/engine/core/stage';
import { getErrorMessage, repository } from '@/lib/api';
import { biomeName } from '@/lib/api/catalog';
import { formatDate, formatDuration, formatNumber } from '@/lib/format';
import { useSession } from '@/hooks/useSession';
import type { BiomeProgress, ProfileSummary } from '@/types/api';

export default function ProfilePage() {
  const { session, signOut } = useSession();
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    repository
      .getProfile()
      .then((result) => {
        if (isActive) setProfile(result);
      })
      .catch((cause: unknown) => {
        if (isActive) setError(getErrorMessage(cause));
      });

    // The profile is re-read when the session changes, so signing in swaps the
    // guest's stats for the account's without a reload.
    return () => {
      isActive = false;
    };
  }, [session]);

  // "Not signed in" is the session's answer, not the mock's. Reading it from
  // the session keeps this page independent of which repository is behind it.
  const isGuest = session === null;

  return (
    <PageShell
      title="Profile"
      subtitle="Your accumulated statistics, biome progress and recent runs."
      width="wide"
    >
      {error && <Notice tone="error">{error}</Notice>}

      {!profile ? (
        <p className="m-0 text-sm text-muted">Loading your profile…</p>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span
                  aria-hidden
                  className="grid size-12 place-items-center rounded-full bg-primary-soft font-display text-xl font-bold text-primary"
                >
                  {profile.user.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-display text-xl font-bold">{profile.user.displayName}</span>
                  <span className="text-sm text-muted">
                    {profile.user.email || 'Playing as a guest'}
                  </span>
                </div>
              </div>

              {isGuest ? (
                <LinkButton href="/register" variant="primary" icon={<UserPlus size={18} />}>
                  Create an account
                </LinkButton>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <LinkButton href="/profile/edit" icon={<Pencil size={18} />}>
                    Edit profile
                  </LinkButton>
                  <Button variant="secondary" onClick={signOut} icon={<LogOut size={18} />}>
                    Sign out
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {isGuest && (
            <Notice tone="info">
              You are playing without an account, so your statistics are kept on this device only. If
              you create an account, everything you have already earned moves across automatically.
            </Notice>
          )}

          {/* TOR 3: สถิติสะสมและประวัติการเล่น. */}
          <Card title="Accumulated statistics" icon={<ChartColumn size={20} />}>
            <StatGrid>
              <StatTile
                label="Runs played"
                icon={<Map size={16} />}
                value={formatNumber(profile.stats.totalRuns)}
              />
              <StatTile
                label="Best score"
                icon={<Trophy size={16} />}
                value={formatNumber(profile.stats.bestScore)}
                isHighlighted
              />
              <StatTile
                label="Total play time"
                icon={<Timer size={16} />}
                value={formatDuration(profile.stats.totalDurationMs)}
              />
              <StatTile
                label="Total movements"
                icon={<Activity size={16} />}
                value={formatNumber(profile.stats.totalMovementCount)}
                detail="Detected by the system, not an energy figure"
              />
              <StatTile
                label="Enemies defeated"
                icon={<Swords size={16} />}
                value={formatNumber(profile.stats.totalEnemiesKilled)}
              />
            </StatGrid>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            {/* TOR 3: ระบบ Biome และ Stage. */}
            <Card title="Biome progress" icon={<Map size={20} />}>
              <div className="flex flex-col gap-4">
                {profile.biomes.map((biome) => (
                  <BiomeRow key={biome.biomeId} biome={biome} />
                ))}
              </div>
              <Link
                href="/stages"
                className="flex items-center gap-1.5 text-sm font-semibold text-primary no-underline"
              >
                Go to stage select
                <ArrowRight aria-hidden size={16} />
              </Link>
            </Card>

            <Card title="Recent runs" icon={<Timer size={20} />}>
              {profile.recentRuns.length === 0 ? (
                <EmptyState
                  title="No runs yet"
                  icon={<Map size={22} />}
                  action={
                    <LinkButton href="/stages" variant="primary" icon={<Map size={18} />}>
                      Choose a stage
                    </LinkButton>
                  }
                >
                  Play a run and it will show up here.
                </EmptyState>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {profile.recentRuns.map((run) => (
                    <li
                      key={run.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-line bg-elevated px-3.5 py-3 text-sm"
                    >
                      <span className="font-semibold">
                        {biomeName(run.biomeId)} &middot; Stage {run.stageNumber}
                      </span>
                      <span className="tabular-nums text-muted">
                        {formatNumber(run.score)} pts &middot; {formatDuration(run.durationMs)}
                      </span>
                      <span className="flex basis-full items-center gap-2 text-xs text-muted">
                        {formatDate(run.completedAt)} &middot; {difficultyLabel(run.difficulty)}
                        <Badge tone={run.isCleared ? 'ok' : 'neutral'}>
                          {run.isCleared ? 'Cleared' : 'Not cleared'}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </PageShell>
  );
}

function BiomeRow({ biome }: { biome: BiomeProgress }) {
  const cleared = biome.stages.filter((stage) => stage.isCleared).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className={`flex items-center gap-1.5 font-semibold ${biome.isUnlocked ? '' : 'text-muted'}`}>
          {!biome.isUnlocked && <Lock aria-hidden size={14} />}
          {biome.name}
          {!biome.isUnlocked && <span className="sr-only"> — locked</span>}
        </span>
        <span className="tabular-nums text-muted">
          {cleared}/{biome.stages.length} stages
        </span>
      </div>

      <StageStrip
        stages={biome.stages}
        label={`${biome.name}: ${cleared} of ${biome.stages.length} stages cleared`}
      />
    </div>
  );
}
