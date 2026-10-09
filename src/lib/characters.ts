import { CONFIG } from '@/engine/config';

/** The selection screen and the runner use the same roster. */
export const CHARACTERS = Object.values(CONFIG.game.characters).map(({ id, name }) => ({ id, name }));
