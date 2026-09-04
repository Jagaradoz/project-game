import { PageShell, NotBuiltYet } from '@/components/ui/PageShell';

export const metadata = { title: 'เลือก Stage และ Biome' };

export default function Page() {
  return (
    <PageShell title="เลือก Stage และ Biome" tor="TOR 3: ระบบ Biome และ Stage — 10 stages per biome, unlocked in order">
      <NotBuiltYet>Biome and stage grid backed by BiomeProgress from the API contract. The chosen biome already flows to the game through the settings store.</NotBuiltYet>
    </PageShell>
  );
}
