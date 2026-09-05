'use client';

/**
 * Cross-page player preferences.
 *
 * These outlive the game canvas: /stages picks a biome, stage and difficulty,
 * /play mounts later and has to agree. The vanilla build read them straight from
 * localStorage inside the game loop; here the store owns persistence and the
 * engine is told.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import { CONFIG } from '@/engine/config';
import { DEFAULT_DIFFICULTY, isDifficulty } from '@/engine/core/stage';
import { BIOME_AUTO } from '@/engine/runtime';
import type { Difficulty, StageSelection } from '@/engine/types';
import { FIRST_BIOME_ID, isKnownBiome, isValidStageNumber } from '@/lib/api/catalog';

interface SettingsState {
  character: string;
  /** The scene shown in /play. BIOME_AUTO lets the run travel through all of them. */
  biome: string;
  /** The stage being played. Separate from `biome`, which is only scenery. */
  stageBiomeId: string;
  stageNumber: number;
  difficulty: Difficulty;
  setCharacter: (character: string) => void;
  setBiome: (biome: string) => void;
  setStage: (biomeId: string, stageNumber: number) => void;
  setDifficulty: (difficulty: Difficulty) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      character: CONFIG.game.defaultCharacter,
      biome: BIOME_AUTO,
      stageBiomeId: FIRST_BIOME_ID,
      stageNumber: 1,
      difficulty: DEFAULT_DIFFICULTY,
      setCharacter: (character) => set({ character }),
      setBiome: (biome) => set({ biome }),
      setStage: (stageBiomeId, stageNumber) =>
        // The stage's biome is also the scene it is played in, so picking a
        // stage pins the scenery rather than leaving it on auto.
        set({ stageBiomeId, stageNumber, biome: stageBiomeId }),
      setDifficulty: (difficulty) => set({ difficulty }),
    }),
    {
      // Bumped from _v1 when the stage and difficulty fields were added: a
      // stored _v1 object has neither, and zustand's persist merges shallowly,
      // so a returning player would otherwise get `difficulty: undefined`.
      name: 'trail_runner_settings_v2',
    },
  ),
);

/**
 * The stage selection, validated on the way out.
 *
 * Persisted state is untrusted input: it may have been written by an older
 * build, hand-edited, or point at a biome that no longer exists. Anything
 * unrecognised falls back rather than reaching the engine.
 */
function selectStageSelection(state: SettingsState): StageSelection {
  return {
    biomeId: isKnownBiome(state.stageBiomeId) ? state.stageBiomeId : FIRST_BIOME_ID,
    stageNumber: isValidStageNumber(state.stageNumber) ? state.stageNumber : 1,
    difficulty: isDifficulty(state.difficulty) ? state.difficulty : DEFAULT_DIFFICULTY,
  };
}

/**
 * The validated stage selection, as a hook.
 *
 * `useShallow` is load-bearing, not decoration. The selector builds a NEW object
 * every call, and zustand compares snapshots with Object.is -- so subscribing to
 * it raw makes every render produce a "new" value, which React reports as
 * "The result of getSnapshot should be cached" and then kills as an infinite
 * update loop. Shallow comparison hands back the previous reference instead.
 */
export function useStageSelection(): StageSelection {
  return useSettings(useShallow(selectStageSelection));
}
