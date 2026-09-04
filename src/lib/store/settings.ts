'use client';

/**
 * Cross-page player preferences.
 *
 * These outlive the game canvas: /stages picks a biome, /play mounts later and
 * has to agree. The vanilla build read them straight from localStorage inside
 * the game loop; here the store owns persistence and the engine is told.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { CONFIG } from '@/engine/config';
import { BIOME_AUTO } from '@/engine/runtime';

interface SettingsState {
  character: string;
  biome: string;
  setCharacter: (character: string) => void;
  setBiome: (biome: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      character: CONFIG.game.defaultCharacter,
      biome: BIOME_AUTO,
      setCharacter: (character) => set({ character }),
      setBiome: (biome) => set({ biome }),
    }),
    {
      // Bumped from `lane_runner_char` when the Knight became the default: a
      // stored choice from an older build would otherwise pin returning players
      // to the robot forever.
      name: 'trail_runner_settings_v1',
    },
  ),
);
