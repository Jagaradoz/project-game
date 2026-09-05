/**
 * The single import every page uses for data: `import { repository } from '@/lib/api'`.
 *
 * Which implementation is behind it is decided once, here, by
 * NEXT_PUBLIC_API_MODE. No page knows or cares -- switching the whole app from
 * the local stand-in to the real backend is one env var and no code change.
 */

import { API_MODE } from '@/lib/api/client';
import { createLiveRepository } from '@/lib/api/live/repository';
import { createMockRepository } from '@/lib/api/mock/repository';
import type { GameRepository } from '@/lib/api/repository';

export const IS_MOCK_MODE = API_MODE !== 'live';

export const repository: GameRepository = IS_MOCK_MODE
  ? createMockRepository()
  : createLiveRepository();

export { ApiError, getErrorMessage } from '@/lib/api/client';
export type { GameRepository } from '@/lib/api/repository';
