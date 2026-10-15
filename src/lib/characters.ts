import { CONFIG } from '@/engine/config';

/** Inline setup, Test Mode, and the runner share the same existing roster. */
export const CHARACTERS = Object.values(CONFIG.game.characters).map(({ id, name }) => ({ id, name }));
