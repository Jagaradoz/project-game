import { PageShell, NotBuiltYet } from '@/components/ui/PageShell';

export const metadata = { title: 'โปรไฟล์ผู้เล่น' };

export default function Page() {
  return (
    <PageShell title="โปรไฟล์ผู้เล่น" tor="TOR 3: หน้าโปรไฟล์ผู้เล่น">
      <NotBuiltYet>Accumulated stats, run history, and per-biome and per-stage progress, from ProfileSummary.</NotBuiltYet>
    </PageShell>
  );
}
