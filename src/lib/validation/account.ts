/**
 * Account and play-record rules, shared by the forms and the API so the two
 * can never disagree. The server re-parses everything; the client copy only
 * saves a round trip.
 */

import { z } from 'zod';

export const ACCOUNT_RULES = {
  usernamePattern: /^[A-Za-z0-9_]{3,20}$/,
  passwordMinLength: 8,
  passwordMaxLength: 72,
} as const;

/** Upper bounds that reject obviously forged runs. */
export const PLAY_LIMITS = {
  maxScore: 10_000_000,
  maxDistanceM: 1_000_000,
  maxDurationMs: 24 * 60 * 60 * 1000,
} as const;

export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(ACCOUNT_RULES.usernamePattern, 'Username must be 3-20 letters, digits or underscores.'),
  password: z
    .string()
    .min(ACCOUNT_RULES.passwordMinLength, `Password must be at least ${ACCOUNT_RULES.passwordMinLength} characters.`)
    .max(ACCOUNT_RULES.passwordMaxLength, `Password must be at most ${ACCOUNT_RULES.passwordMaxLength} characters.`),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/** Login only checks shape: telling a guesser which rule failed helps nobody. */
export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
});

const boundedInt = (max: number) => z.number().int().min(0).max(max);

export const playSchema = z.object({
  score: boundedInt(PLAY_LIMITS.maxScore),
  distanceM: boundedInt(PLAY_LIMITS.maxDistanceM),
  durationMs: boundedInt(PLAY_LIMITS.maxDurationMs),
});

export type PlayInput = z.infer<typeof playSchema>;

export interface PlayRecord extends PlayInput {
  playedAt: number;
}

export interface PlaySummary {
  runs: number;
  bestScore: number;
  bestDistanceM: number;
  totalDurationMs: number;
}

/** The first issue's message, which is what a form shows under the field. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input.';
}
