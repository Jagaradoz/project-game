import { PageShell, NotBuiltYet } from '@/components/ui/PageShell';

export const metadata = { title: 'สรุปผลหลังเล่น' };

export default function Page() {
  return (
    <PageShell title="สรุปผลหลังเล่น" tor="TOR 3: หน้าสรุปผลหลังเล่น">
      <NotBuiltYet>Score, enemies killed, duration, movement count, stage and biome cleared, compared against the player&apos;s own history. Submitted through SubmitRunInput with its clientRunId, so a retry cannot double-record a run.</NotBuiltYet>
    </PageShell>
  );
}
