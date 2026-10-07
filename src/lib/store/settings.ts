'use client';

/**
 * Cross-page player preferences.
 *
 * These outlive the game canvas: the character is picked on one page and
 * /play mounts later and has to agree. The vanilla build read them straight from
 * localStorage inside the game loop; here the store owns persistence and the
 * engine is told.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { CONFIG } from '@/engine/config';

interface SettingsState {
  character: string;
  setCharacter: (character: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      character: CONFIG.game.defaultCharacter,
      setCharacter: (character) => set({
        character: Object.hasOwn(CONFIG.game.characters, character) ? character : CONFIG.game.defaultCharacter,
      }),
    }),
    {
      // Bumped from _v2 when the stage and difficulty fields were removed, so a
      // returning player's stale stage choice is not carried along forever.
      name: 'trail_runner_settings_v3',
      merge: (persisted, current) => {
        const saved = persisted as Partial<SettingsState> | undefined;
        return {
          ...current,
          ...saved,
          character: saved?.character && Object.hasOwn(CONFIG.game.characters, saved.character)
            ? saved.character
            : CONFIG.game.defaultCharacter,
        };
      },
    },
  ),
);

