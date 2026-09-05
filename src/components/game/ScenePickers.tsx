import { Leaf, Mountain, Shuffle, Sun, Trees, type LucideIcon } from 'lucide-react';

import { CONFIG } from '@/engine/config';
import { BIOME_AUTO } from '@/engine/runtime';
import { BIOMES } from '@/engine/render/world/biomes';
import type { CharacterDef, CharacterRoster } from '@/engine/types';

/**
 * A glyph per biome. `<option>` cannot host an SVG, so the icon is shown beside
 * the select rather than inside the list -- it tracks the current value, and the
 * option text still names every choice.
 */
const BIOME_ICONS: Record<string, LucideIcon> = {
  forest: Trees,
  autumn: Leaf,
  highlands: Mountain,
  oasis: Sun,
};

const roster = CONFIG.game.characters as unknown as CharacterRoster;

interface ScenePickersProps {
  character: string;
  biome: string;
  onCharacterChange: (id: string) => void;
  onBiomeChange: (id: string) => void;
}

/**
 * The biome list is generated from BIOMES, so adding a biome does not also mean
 * remembering to edit the markup.
 */
export function ScenePickers({
  character,
  biome,
  onCharacterChange,
  onBiomeChange,
}: ScenePickersProps) {
  const BiomeIcon = biome === BIOME_AUTO ? Shuffle : (BIOME_ICONS[biome] ?? Trees);

  return (
    <div className="absolute inset-x-3 bottom-3 z-[2] flex flex-wrap items-center gap-2 rounded-lg border border-white/15 bg-[rgba(15,20,26,0.88)] px-3 py-2 shadow-lg backdrop-blur-lg">
      <Label htmlFor="biomeSelect" icon={<BiomeIcon size={14} />}>
        Biome
      </Label>
      <Select id="biomeSelect" value={biome} onChange={onBiomeChange} aria-label="Select biome">
        <option value={BIOME_AUTO}>Auto (by distance)</option>
        {BIOMES.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </Select>

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

      {/* A developer tool for reviewing the 3D assets, not a player-facing page. */}
      {process.env.NODE_ENV !== 'production' && (
        <a
          href="/catalog.html"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line-strong bg-elevated px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-muted no-underline transition-colors hover:border-muted hover:text-text"
        >
          <Trees aria-hidden size={13} />
          3D catalog
        </a>
      )}
    </div>
  );
}

function Label({
  htmlFor,
  icon,
  children,
}: {
  htmlFor: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-accent-text uppercase"
    >
      {icon && <span aria-hidden className="flex">{icon}</span>}
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
      className="min-h-8 min-w-0 max-w-[200px] flex-auto cursor-pointer rounded-md border border-line-strong bg-surface px-2 py-1 text-xs font-semibold text-text transition-colors hover:border-muted focus:border-primary"
      {...rest}
    >
      {children}
    </select>
  );
}
