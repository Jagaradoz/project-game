'use client';

/**
 * Cross-page player preferences.
 *
 * These outlive the game canvas: /stages picks a stage and difficulty,
 * /play mounts later and has to agree. The vanilla build read them straight from
 * localStorage inside the game loop; here the store owns persistence and the
 * engine is told.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import { CONFIG } from '@/engine/config';
import { DEFAULT_DIFFICULTY, isDifficulty } from '@/engine/core/stage';
import type { Difficulty, StageSelection } from '@/engine/types';
import { FIRST_BIOME_ID, isKnownBiome, isValidStageNumber } from '@/lib/api/catalog';

interface SettingsState {
  character: string;
  /** The stage being played. */
  stageBiomeId: string;
  stageNumber: number;
  difficulty: Difficulty;
  setCharacter: (character: string) => void;
  setStage: (biomeId: string, stageNumber: number) => void;
  setDifficulty: (difficulty: Difficulty) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      character: CONFIG.game.defaultCharacter,
      stageBiomeId: FIRST_BIOME_ID,
      stageNumber: 1,
      difficulty: DEFAULT_DIFFICULTY,
      setCharacter: (character) => set({
        character: Object.hasOwn(CONFIG.game.characters, character) ? character : CONFIG.game.defaultCharacter,
      }),
      setStage: (stageBiomeId, stageNumber) => set({ stageBiomeId, stageNumber }),
      setDifficulty: (difficulty) => set({ difficulty }),
    }),
    {
      // Bumped from _v1 when the stage and difficulty fields were added: a
      // stored _v1 object has neither, and zustand's persist merges shallowly,
      // so a returning player would otherwise get `difficulty: undefined`.
      name: 'trail_runner_settings_v2',
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
