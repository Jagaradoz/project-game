'use client';

/** Preferences survive client navigation and reset when the visit reloads. */
import { create } from 'zustand';
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
  startingDifficulty: number;
  setStartingDifficulty: (difficulty: number) => void;
}

export const useSettings = create<SettingsState>()((set) => ({
  character: CONFIG.game.defaultCharacter,
  setCharacter: (character) => set({
    character: Object.hasOwn(CONFIG.game.characters, character) ? character : CONFIG.game.defaultCharacter,
  }),
  hideCamera: false,
  setHideCamera: (hideCamera) => set({ hideCamera }),
  graphicsQuality: CONFIG.game.quality,
  setGraphicsQuality: (quality) => set({
    graphicsQuality: isGraphicsQuality(quality) ? quality : CONFIG.game.quality,
  }),
  startingDifficulty: 1,
  setStartingDifficulty: (difficulty) => set({
    startingDifficulty: Number.isFinite(difficulty) ? Math.max(1, Math.min(5, Math.round(difficulty))) : 1,
  }),
}));
