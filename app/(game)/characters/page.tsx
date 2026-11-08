import type { Metadata } from 'next';

import { CharacterSelection } from '@/components/game/CharacterSelection';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = { title: 'Choose your magician' };

export default function CharactersPage() {
  return (
    <PageShell
      title="Choose your magician"
      subtitle="Pick a magician to start. Game Mode setup and the camera check come next."
      width="wide"
    >
      <CharacterSelection />
    </PageShell>
  );
}
