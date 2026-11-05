import type { Metadata } from 'next';

import { PlayStats } from '@/components/account/PlayStats';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = { title: 'My stats' };

export default function StatsPage() {
  return (
    <PageShell title="My stats" eyebrow="Account" subtitle="Every Game Mode run you finish while logged in." width="wide">
      <PlayStats />
    </PageShell>
  );
}
