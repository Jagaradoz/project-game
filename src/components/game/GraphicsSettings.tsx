'use client';

import { useId } from 'react';
import type { ShadowQuality } from '@/engine/types';
import { useSettings } from '@/lib/store/settings';

const OPTIONS = [
  { value: 'low', label: 'Low', description: 'Fewer trees & grass · no shadows · 30 FPS cap' },
  { value: 'medium', label: 'Medium', description: 'Balanced scenery & shadows · 45 FPS cap' },
  { value: 'high', label: 'High', description: 'Full scenery · sharper shadows · 60 FPS cap' },
] as const;

export function GraphicsSettings({ activeQuality }: { activeQuality?: ShadowQuality | null }) {
  const id = useId();
  const quality = useSettings(state => state.graphicsQuality);
  const setQuality = useSettings(state => state.setGraphicsQuality);
  const current = OPTIONS.find(option => option.value === quality)!;

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={`${id}-description`}>
      <legend className="mb-2 text-xs font-extrabold tracking-[0.08em] text-accent-text uppercase">Graphics</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(option => (
          <label key={option.value} className="relative cursor-pointer">
            <input
              type="radio"
              name={`${id}-quality`}
              value={option.value}
              checked={quality === option.value}
              onChange={() => setQuality(option.value)}
              className="peer sr-only"
            />
            <span className="flex min-h-11 items-center justify-center border-2 border-ink bg-surface px-2 text-sm font-bold text-text transition-colors peer-checked:bg-primary peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary hover:bg-primary-soft">
              {option.label}
            </span>
          </label>
        ))}
      </div>
      <p id={`${id}-description`} className="mt-2 mb-0 text-xs leading-relaxed text-muted">
        {current.description}. Low is best for slower devices.
      </p>
      {activeQuality && activeQuality !== quality && (
        <p role="status" className="mt-2 mb-0 text-xs leading-relaxed text-accent-text">
          Using {OPTIONS.find(option => option.value === activeQuality)?.label} to keep play smooth.
        </p>
      )}
    </fieldset>
  );
}
