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
import { isGraphicsQuality } from '@/engine/render/quality';
import type { ShadowQuality } from '@/engine/types';

interface SettingsState {
  character: string;
  setCharacter: (character: string) => void;
  hideCamera: boolean;
  setHideCamera: (hideCamera: boolean) => void;
  graphicsQuality: ShadowQuality;
  setGraphicsQuality: (quality: ShadowQuality) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      character: CONFIG.game.defaultCharacter,
      setCharacter: (character) => set({
        character: Object.hasOwn(CONFIG.game.characters, character) ? character : CONFIG.game.defaultCharacter,
      }),
      hideCamera: false,
      setHideCamera: (hideCamera) => set({ hideCamera }),
      graphicsQuality: CONFIG.game.quality,
      setGraphicsQuality: (graphicsQuality) => set({ graphicsQuality }),
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
          hideCamera: typeof saved?.hideCamera === 'boolean' ? saved.hideCamera : false,
          graphicsQuality: isGraphicsQuality(saved?.graphicsQuality) ? saved.graphicsQuality : CONFIG.game.quality,
        };
      },
    },
  ),
);

