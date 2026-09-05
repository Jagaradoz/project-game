'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { LinkButton, Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
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
    <PageShell title="โปรไฟล์ผู้เล่น" tor="TOR 3: หน้าโปรไฟล์ผู้เล่น">
      {error && <Notice tone="error">{error}</Notice>}

      {!profile ? (
        <p className="m-0 text-sm text-muted">กำลังโหลด...</p>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-lg font-bold">{profile.user.displayName}</span>
                <span className="text-xs text-muted">
                  {profile.user.email || 'ยังไม่ได้สมัครสมาชิก'}
                </span>
              </div>

              {isGuest ? (
                <LinkButton href="/register" variant="primary">
                  สมัครสมาชิก
                </LinkButton>
              ) : (
                <div className="flex gap-2">
                  <LinkButton href="/profile/edit">แก้ไขข้อมูล</LinkButton>
                  <Button variant="secondary" onClick={signOut}>
                    ออกจากระบบ
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {isGuest && (
            <Notice tone="info">
              คุณกำลังเล่นแบบไม่ได้เข้าสู่ระบบ สถิติจะถูกเก็บไว้ในเครื่องนี้เท่านั้น
              หากสมัครสมาชิก สถิติที่มีอยู่จะถูกโอนไปยังบัญชีของคุณโดยอัตโนมัติ
            </Notice>
          )}

          <Card title="สถิติสะสม" note="TOR 3: สถิติสะสมและประวัติการเล่น">
            <StatGrid>
              <StatTile label="จำนวนรอบที่เล่น" value={formatNumber(profile.stats.totalRuns)} />
              <StatTile
                label="คะแนนสูงสุด"
                value={formatNumber(profile.stats.bestScore)}
                isHighlighted
              />
              <StatTile label="เวลาเล่นรวม" value={formatDuration(profile.stats.totalDurationMs)} />
              <StatTile
                label="การเคลื่อนไหวสะสม"
                value={formatNumber(profile.stats.totalMovementCount)}
                detail="ค่าที่ระบบตรวจวัด ไม่ใช่ค่าพลังงาน"
              />
              <StatTile
                label="ศัตรูที่กำจัดรวม"
                value={formatNumber(profile.stats.totalEnemiesKilled)}
              />
            </StatGrid>
          </Card>

          <Card title="ความคืบหน้าแต่ละพื้นที่" note="TOR 3: ระบบ Biome และ Stage">
            <div className="flex flex-col gap-3">
              {profile.biomes.map((biome) => (
                <BiomeRow key={biome.biomeId} biome={biome} />
              ))}
            </div>
            <Link href="/stages" className="text-sm font-semibold text-accent">
              ไปหน้าเลือกด่าน →
            </Link>
          </Card>

          <Card title="ประวัติการเล่นล่าสุด">
            {profile.recentRuns.length === 0 ? (
              <EmptyState title="ยังไม่มีประวัติการเล่น">
                เล่นสักรอบแล้วผลจะมาแสดงที่นี่
              </EmptyState>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {profile.recentRuns.map((run) => (
                  <li
                    key={run.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg bg-surface px-3 py-2.5 text-sm"
                  >
                    <span className="font-semibold">
                      {biomeName(run.biomeId)} · ด่าน {run.stageNumber}
                    </span>
                    <span className="tabular-nums text-muted">
                      {formatNumber(run.score)} คะแนน · {formatDuration(run.durationMs)}
                    </span>
                    <span className="basis-full text-xs text-muted">
                      {formatDate(run.completedAt)} · {difficultyLabel(run.difficulty)} ·{' '}
                      {run.isCleared ? 'ผ่านด่าน' : 'ไม่ผ่าน'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </PageShell>
  );
}

function BiomeRow({ biome }: { biome: BiomeProgress }) {
  const cleared = biome.stages.filter((stage) => stage.isCleared).length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className={biome.isUnlocked ? 'font-semibold' : 'font-semibold text-muted'}>
          {biome.isUnlocked ? biome.name : `🔒 ${biome.name}`}
        </span>
        <span className="tabular-nums text-muted">
          {cleared}/{biome.stages.length} ด่าน
        </span>
      </div>

      <div
        className="flex gap-1"
        role="img"
        aria-label={`${biome.name}: ผ่านแล้ว ${cleared} จาก ${biome.stages.length} ด่าน`}
      >
        {biome.stages.map((stage) => (
          <span
            key={stage.stageNumber}
            className={`h-1.5 flex-1 rounded-full ${
              stage.isCleared ? 'bg-ok' : stage.isUnlocked ? 'bg-accent opacity-40' : 'bg-off opacity-40'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
