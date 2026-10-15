/** One in-memory repository per application visit. Reloading starts afresh. */
import { createVisitRepository } from '@/lib/api/visit';

export const repository = createVisitRepository();
export { ApiError, getErrorMessage } from '@/lib/api/client';
export type { GameRepository } from '@/lib/api/repository';
