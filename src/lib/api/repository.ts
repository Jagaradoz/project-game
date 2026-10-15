/** The visit-only data interface used by pages. */
import type { ProfileSummary, RunResult, SubmitRunInput } from '@/types/api';

export interface GameRepository {
  getProfile(): Promise<ProfileSummary>;
  submitRun(input: SubmitRunInput): Promise<RunResult>;
}
