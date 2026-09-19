/**
 * The one interface every page calls for data.
 *
 * TOR 5 gives the backend, the database and the API to นายวสันต์ จันทร์ฉิม. This
 * is the seam that lets the frontend be finished and demoed before any of that
 * exists: `src/lib/api/mock` implements it against localStorage, `live`
 * implements it against the real API, and `src/lib/api/index.ts` picks one from
 * NEXT_PUBLIC_API_MODE. No page imports either implementation directly.
 *
 * Every method rejects with ApiError on failure, so callers have one thing to
 * catch regardless of which implementation is behind it.
 */

import type {
  AuthSession,
  BiomeProgress,
  LeaderboardEntry,
  LoginInput,
  ProfileEditInput,
  ProfileSummary,
  RegisterInput,
  RunResult,
  SubmitRunInput,
  User,
} from '@/types/api';

export interface GameRepository {
  /** Null when nobody is signed in. The game itself never requires an account. */
  getSession(): Promise<AuthSession | null>;
  register(input: RegisterInput): Promise<AuthSession>;
  login(input: LoginInput): Promise<AuthSession>;
  logout(): Promise<void>;

  /** The email is fixed at registration; the display name and avatar seed can change. */
  updateDisplayName(displayName: string): Promise<User>;
  updateProfile(input: ProfileEditInput): Promise<User>;

  getProfile(): Promise<ProfileSummary>;
  getBiomes(): Promise<BiomeProgress[]>;

  /**
   * Records a finished run. Implementations MUST treat `clientRunId` as an
   * idempotency key -- TOR 3 requires that one finished run is never recorded twice,
   * and /result is reachable by reload.
   */
  submitRun(input: SubmitRunInput): Promise<RunResult>;

  getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;
}
