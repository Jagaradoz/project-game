'use client';

/* TOR 3: หน้าโปรไฟล์ผู้เล่น -- accumulated stats and play history. */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CircleCheck,
  LogOut,
  Map,
  Pencil,
  Play,
  UserPlus,
} from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';

import { AccountTabs } from '@/components/account/AccountTabs';
import { PlayerAvatar } from '@/components/account/PlayerAvatar';
import { RunGrid } from '@/components/account/RunGrid';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { getErrorMessage, repository } from '@/lib/api';
import { avatarSeedFor } from '@/lib/avatar';
import { formatDuration, formatNumber } from '@/lib/format';
import { useSession } from '@/hooks/useSession';
import type { BiomeProgress, PlayerStats, ProfileSummary, User } from '@/types/api';

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <PageShell title="Profile" heading={false} width="wide">
          <h1 className="m-0 text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="m-0 text-sm text-muted">Loading your profile…</p>
        </PageShell>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}

function ProfileContent() {
  const { session, signOut } = useSession();
  const searchParams = useSearchParams();
  const showProgress = searchParams.get('tab') === 'progress';
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
    <PageShell title="Profile" heading={false} width="wide">
      {error && <Notice tone="error">{error}</Notice>}

      {!profile ? (
        <>
          <h1 className="m-0 text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="m-0 text-sm text-muted">Loading your profile…</p>
        </>
      ) : (
        <>
          <ProfileHero
            user={profile.user}
            stats={profile.stats}
            biomes={profile.biomes}
            isGuest={isGuest}
            onSignOut={signOut}
          />

          <AccountTabs />

          {showProgress ? (
            <TrainingProgressPanel biomes={profile.biomes} />
          ) : (
            // TOR 3: สถิติสะสมและประวัติการเล่น.
            <RunGrid runs={profile.recentRuns} />
          )}
        </>
      )}
    </PageShell>
  );
}

function ProfileHero({
  user,
  stats,
  biomes,
  isGuest,
  onSignOut,
}: {
  user: User;
  stats: PlayerStats;
  biomes: BiomeProgress[];
  isGuest: boolean;
  onSignOut: () => void;
}) {
  const handle = user.email || 'Playing as a guest';
  const biomeLine = biomeStatusLine(biomes);
  const seed = avatarSeedFor(user);

  const avatar = (
    <PlayerAvatar seed={seed} name={user.displayName} size="lg" decorative />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4 sm:gap-5">
        {isGuest ? (
          avatar
        ) : (
          <Link
            href="/profile/edit"
            aria-label="Change avatar"
            className="relative flex-none rounded-none no-underline"
          >
            {avatar}
            <span
              aria-hidden
              className="absolute right-0 bottom-0 grid size-7 place-items-center rounded-none border-2 border-ink bg-surface text-text"
            >
              <Pencil size={12} />
            </span>
          </Link>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">{user.displayName}</h1>
            <p className="m-0 truncate text-sm text-muted">{handle}</p>
          </div>

          <dl className="m-0 flex flex-wrap gap-x-6 gap-y-2">
            <ProfileStat label="Runs" value={formatNumber(stats.totalRuns)} />
            <ProfileStat label="Best score" value={formatNumber(stats.bestScore)} isHighlighted />
            <ProfileStat label="Play time" value={formatDuration(stats.totalDurationMs)} />
          </dl>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-sm leading-relaxed">
        {isGuest ? (
          <Notice tone="info">
            You are playing without an account, so your statistics are kept on this device only. If
            you create an account, everything you have already earned moves across automatically.
          </Notice>
        ) : (
          biomeLine && <p className="m-0 text-text">{biomeLine}</p>
        )}
        <p className="m-0 text-muted">
          {formatNumber(stats.totalMovementCount)} movements ·{' '}
          {formatNumber(stats.totalEnemiesKilled)} enemies defeated
        </p>
        <p className="m-0 text-xs text-subtle">
          Movements are detected by the system, not an energy figure.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {isGuest ? (
          <LinkButton href="/register" variant="primary" size="sm" icon={<UserPlus size={16} />}>
            Create an account
          </LinkButton>
        ) : (
          <>
            <LinkButton href="/profile/edit" size="sm" icon={<Pencil size={16} />}>
              Edit profile
            </LinkButton>
            <Button variant="secondary" size="sm" onClick={onSignOut} icon={<LogOut size={16} />}>
              Sign out
            </Button>
          </>
        )}
        <LinkButton href="/play" size="sm" icon={<Play size={16} />}>
          Train
        </LinkButton>
      </div>
    </div>
  );
}

function ProfileStat({
  label,
  value,
  isHighlighted,
}: {
  label: string;
  value: string;
  isHighlighted?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`m-0 text-lg font-semibold tabular-nums ${isHighlighted ? 'text-primary' : 'text-text'}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Training is one endless stage, so its progress is one row: the best score. */
function trainingStage(biomes: BiomeProgress[]) {
  return biomes[0]?.stages[0] ?? null;
}

function TrainingProgressPanel({ biomes }: { biomes: BiomeProgress[] }) {
  const stage = trainingStage(biomes);
  const name = biomes[0]?.name ?? 'Training';

  return (
    <Card title="Training progress" icon={<Map size={20} />}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <CircleCheck aria-hidden size={16} className="text-ok-text" />
          {name} &middot; Endless training
        </span>
        <span className="tabular-nums text-muted">
          Best {stage?.bestScore != null ? formatNumber(stage.bestScore) : '—'}
        </span>
      </div>
    </Card>
  );
}

function biomeStatusLine(biomes: BiomeProgress[]): string | null {
  const stage = trainingStage(biomes);
  if (!stage) return null;
  return `Training · best ${stage.bestScore != null ? formatNumber(stage.bestScore) : '—'}`;
}
