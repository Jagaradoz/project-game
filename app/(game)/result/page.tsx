'use client';

import { useEffect, useState } from 'react';

import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { difficultyLabel } from '@/engine/core/stage';
import { getErrorMessage, repository } from '@/lib/api';
import { biomeName } from '@/lib/api/catalog';
import { formatDelta, formatDuration, formatNumber } from '@/lib/format';
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
    <PageShell title="สรุปผลหลังเล่น" tor="TOR 3: หน้าสรุปผลหลังเล่น">
      {error && <Notice tone="error">{error}</Notice>}

      {!run ? (
        <EmptyState title="ยังไม่มีผลการเล่น">
          เมื่อเล่นจบสักรอบ ผลจะมาแสดงที่นี่
        </EmptyState>
      ) : (
        <>
          <Notice tone={run.isCleared ? 'ok' : 'info'} title={run.isCleared ? 'ผ่านด่านแล้ว' : 'จบรอบแล้ว'}>
            {biomeName(run.biomeId)} · ด่าน {run.stageNumber} · ระดับ{difficultyLabel(run.difficulty)}
            {run.isCleared
              ? ' — ด่านถัดไปถูกปลดล็อกแล้ว'
              : ' — ยังไม่ถึงเป้าหมายของด่านนี้ ลองอีกครั้งได้เลย'}
          </Notice>

          <Card title="ผลรอบนี้">
            <StatGrid>
              <StatTile label="คะแนน" value={formatNumber(run.score)} isHighlighted />
              <StatTile label="ศัตรูที่กำจัด" value={formatNumber(run.enemiesKilled)} />
              <StatTile label="ระยะเวลาเล่น" value={formatDuration(run.durationMs)} />
              <StatTile
                label="การเคลื่อนไหว"
                value={formatNumber(run.movementCount)}
                detail="ค่าที่ระบบตรวจวัด ไม่ใช่ค่าพลังงาน"
              />
              <StatTile label="ระยะทาง" value={`${formatNumber(run.distanceM)} ม.`} />
            </StatGrid>
          </Card>

          {profile && <ComparisonCard run={run} profile={profile} />}

          <div className="flex flex-wrap gap-2">
            <LinkButton href="/play" variant="primary" className="flex-[1_1_160px]">
              เล่นอีกครั้ง
            </LinkButton>
            <LinkButton href="/stages" className="flex-[1_1_160px]">
              เลือกด่าน
            </LinkButton>
            <LinkButton href="/" className="flex-[1_1_160px]">
              หน้าแรก
            </LinkButton>
          </div>
        </>
      )}
    </PageShell>
  );
}

/**
 * TOR 3: แสดงผลเปรียบเทียบกับประวัติการเล่นของผู้เล่นเอง.
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
    <Card title="เทียบกับสถิติของตัวเอง">
      {isPersonalBest && (
        <p className="m-0 font-semibold text-ok">🎉 คะแนนสูงสุดใหม่ของคุณ!</p>
      )}

      <StatGrid>
        <StatTile label="คะแนนสูงสุดของคุณ" value={formatNumber(profile.stats.bestScore)} />
        <StatTile label="จำนวนรอบที่เล่นทั้งหมด" value={formatNumber(profile.stats.totalRuns)} />
        {previous ? (
          <>
            <StatTile
              label="เทียบคะแนนกับรอบก่อน"
              value={formatDelta(run.score - previous.score)}
              detail={`รอบก่อน ${formatNumber(previous.score)} คะแนน`}
            />
            <StatTile
              label="เทียบการเคลื่อนไหว"
              value={formatDelta(run.movementCount - previous.movementCount)}
              detail={`รอบก่อน ${formatNumber(previous.movementCount)}`}
            />
          </>
        ) : (
          <StatTile
            label="เทียบกับรอบก่อน"
            value="--"
            detail="นี่เป็นครั้งแรกที่คุณเล่นด่านนี้"
          />
        )}
      </StatGrid>
    </Card>
  );
}
