import { Trees } from 'lucide-react';

import { CONFIG } from '@/engine/config';
import type { CharacterDef, CharacterRoster } from '@/engine/types';

const roster = CONFIG.game.characters as unknown as CharacterRoster;

interface ScenePickersProps {
  character: string;
  onCharacterChange: (id: string) => void;
}

/** Developer scene controls for /play. */
export function ScenePickers({ character, onCharacterChange }: ScenePickersProps) {
  return (
    <div className="mx-auto flex w-full max-w-[calc(80vh*3/4)] flex-wrap items-center justify-between gap-3 rounded-none border-2 border-ink bg-surface px-3 py-2 sm:px-3.5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="charSelect">Character</Label>
          <Select
            id="charSelect"
            value={character}
            onChange={onCharacterChange}
            aria-label="Select character model"
          >
            {Object.values(roster).map((entry: CharacterDef) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* A developer tool for reviewing the 3D assets, not a player-facing page. */}
      {process.env.NODE_ENV !== 'production' && (
        <a
          href="/catalog.html"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-none border-2 border-ink bg-elevated px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-muted no-underline transition-colors hover:border-muted hover:text-text"
        >
          <Trees aria-hidden size={13} />
          3D catalog
        </a>
      )}
    </div>
  );
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-accent-text uppercase"
    >
      {children}
    </label>
  );
}

function Select({
  id,
  value,
  onChange,
  children,
  ...rest
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
} & React.AriaAttributes) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-8 min-w-0 max-w-[200px] flex-auto cursor-pointer rounded-none border-2 border-ink bg-surface px-2 py-1 text-xs font-semibold text-text transition-colors hover:border-muted focus:border-primary"
      {...rest}
    >
      {children}
    </select>
  );
}
