'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { CHARACTERS } from '@/lib/characters';
import { useSettings } from '@/lib/store/settings';
import { GraphicsSettings } from '@/components/game/GraphicsSettings';

const MagicianPreviewCanvas = dynamic(
  () => import('@/components/game/GameCanvas').then(module => module.MagicianPreviewCanvas),
  { ssr: false },
);

export function CharacterSelection() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const character = useSettings(state => state.character);
  const setCharacter = useSettings(state => state.setCharacter);
  const [statuses, setStatuses] = useState<Record<string, 'loading' | 'ready' | 'error'>>({});
  const onStatus = useCallback((id: string, status: 'loading' | 'ready' | 'error') => {
    setStatuses(current => ({ ...current, [id]: status }));
  }, []);

  return (
    <div ref={containerRef} className="relative isolate">
      <div className="relative z-[2] mb-6 max-w-md border-2 border-ink bg-surface p-4">
        <GraphicsSettings />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {CHARACTERS.map(entry => {
          const selected = entry.id === character;
          const status = statuses[entry.id] ?? 'loading';
          return (
            <button
              key={entry.id}
              type="button"
              aria-label={`Play as ${entry.name}`}
              onClick={() => {
                setCharacter(entry.id);
                router.push('/play');
              }}
              className={`group flex min-w-0 cursor-pointer flex-col border-2 border-ink text-left shadow-[4px_4px_0_var(--color-ink)] transition-colors hover:bg-primary-soft focus-visible:bg-primary-soft ${selected ? 'bg-primary-soft' : 'bg-surface'}`}
            >
              <span data-character-preview={entry.id} data-preview-status={status} className="relative block h-[210px] w-full sm:h-[260px] lg:h-[280px]" aria-hidden="true">
                {status === 'loading' && (
                  <span className="absolute inset-0 grid place-content-center justify-items-center gap-2 text-muted">
                    <LoaderCircle size={22} className="animate-spin" />
                    <span className="text-xs">Loading magician…</span>
                  </span>
                )}
                {status === 'error' && (
                  <span className="absolute inset-0 grid place-content-center px-4 text-center text-xs leading-relaxed text-muted">
                    Preview unavailable. You can still choose this magician.
                  </span>
                )}
              </span>
              <span className="relative z-[2] flex w-full flex-1 flex-col gap-2 border-t-2 border-ink bg-inherit px-3 py-4 sm:px-4">
                <span className="text-base font-extrabold leading-tight sm:text-lg">{entry.name}</span>
                <span className="flex items-center justify-between gap-2 text-sm font-semibold text-accent-text">
                  Play <ArrowRight aria-hidden size={17} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <MagicianPreviewCanvas containerRef={containerRef} onStatus={onStatus} />
    </div>
  );
}
