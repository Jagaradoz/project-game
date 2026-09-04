import { CONFIG } from '@/engine/config';
import { BIOME_AUTO } from '@/engine/runtime';
import { BIOMES } from '@/engine/render/world/biomes';
import type { CharacterDef, CharacterRoster } from '@/engine/types';

const BIOME_ICONS: Record<string, string> = {
  forest: '🌲',
  autumn: '🍂',
  highlands: '🪨',
  oasis: '🌵',
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
  return (
    <div className="absolute inset-x-3 bottom-3 z-[2] flex flex-wrap items-center gap-2 rounded-lg border border-white/12 bg-[rgba(16,20,24,0.85)] px-2.5 py-1.5 shadow-[0_4px_12px_rgba(0,0,0,0.45)] backdrop-blur-lg">
      <Label htmlFor="biomeSelect">Biome</Label>
      <Select id="biomeSelect" value={biome} onChange={onBiomeChange} aria-label="Select Biome">
        <option value={BIOME_AUTO}>🔄 Auto (by distance)</option>
        {BIOMES.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {`${BIOME_ICONS[entry.id] ?? '•'} ${entry.name}`}
          </option>
        ))}
      </Select>

      <Label htmlFor="charSelect">Character</Label>
      <Select
        id="charSelect"
        value={character}
        onChange={onCharacterChange}
        aria-label="Select Character Model"
      >
        {Object.values(roster).map((entry: CharacterDef) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </Select>

      <a
        href="/catalog.html"
        title="View 3D Asset Catalog"
        className="inline-flex items-center gap-1 rounded-md border border-[#22c55e] bg-[#166534] px-2.5 py-[5px] text-[11px] font-bold tracking-[0.02em] whitespace-nowrap text-[#86efac] no-underline transition-all hover:bg-[#22c55e] hover:text-[#0b1518] hover:shadow-[0_0_10px_rgba(34,197,94,0.4)]"
      >
        🌲 3D Catalog
      </a>
    </div>
  );
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[11px] font-bold tracking-[0.08em] uppercase text-accent"
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
      className="min-w-0 max-w-[220px] flex-auto cursor-pointer rounded-md border border-line bg-surface px-2 py-[5px] text-xs font-semibold text-white outline-hidden transition-[border-color,box-shadow] hover:border-accent focus:border-accent focus:shadow-[0_0_8px_rgba(0,229,255,0.35)]"
      {...rest}
    >
      {children}
    </select>
  );
}
