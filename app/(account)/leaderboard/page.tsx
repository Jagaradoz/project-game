import { PageShell, NotBuiltYet } from '@/components/ui/PageShell';

export const metadata = { title: 'ตารางคะแนน' };

export default function Page() {
  return (
    <PageShell title="ตารางคะแนน" tor="TOR 3: ระบบตารางคะแนน">
      <NotBuiltYet>Top scores by in-game display name, so a player need never expose their real one.</NotBuiltYet>
    </PageShell>
  );
}
