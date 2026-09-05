'use client';

import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { getErrorMessage, repository } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import type { LeaderboardEntry } from '@/types/api';

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
    <PageShell title="ตารางคะแนน" tor="TOR 3: ระบบตารางคะแนน">
      <Notice tone="info">
        ตารางนี้แสดงเฉพาะ<strong>ชื่อในเกม</strong>ที่ผู้เล่นตั้งไว้ ไม่แสดงอีเมลหรือชื่อจริง
        คุณเปลี่ยนชื่อในเกมได้ที่หน้าแก้ไขข้อมูลส่วนตัว
      </Notice>

      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        {!entries ? (
          <p className="m-0 text-sm text-muted">กำลังโหลด...</p>
        ) : entries.length === 0 ? (
          <EmptyState title="ยังไม่มีคะแนนในตาราง">
            เล่นให้จบสักรอบแล้วคะแนนของคุณจะขึ้นมาที่นี่
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">อันดับคะแนนสูงสุดของผู้เล่น</caption>
              <thead>
                <tr className="text-left text-xs tracking-[0.08em] text-muted uppercase">
                  <th scope="col" className="py-2 pr-2 font-semibold">
                    อันดับ
                  </th>
                  <th scope="col" className="py-2 pr-2 font-semibold">
                    ชื่อในเกม
                  </th>
                  <th scope="col" className="py-2 pr-2 text-right font-semibold">
                    คะแนน
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    วันที่
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={`${entry.rank}-${entry.displayName}`}
                    className={`border-t border-line ${entry.isCurrentUser ? 'text-accent' : ''}`}
                  >
                    <td className="py-2.5 pr-2 tabular-nums">{entry.rank}</td>
                    <td className="py-2.5 pr-2 font-semibold">
                      {entry.displayName}
                      {entry.isCurrentUser && (
                        <span className="pl-1.5 text-xs font-normal">(คุณ)</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-right tabular-nums">
                      {formatNumber(entry.score)}
                    </td>
                    <td className="py-2.5 text-right text-muted">{formatDate(entry.recordedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/stages" variant="primary" className="flex-[1_1_160px]">
          เล่นเพื่อทำคะแนน
        </LinkButton>
        <LinkButton href="/profile" className="flex-[1_1_160px]">
          ดูสถิติของฉัน
        </LinkButton>
      </div>
    </PageShell>
  );
}
