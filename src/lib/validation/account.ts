/**
 * Input validation for the account forms.
 *
 * One place, shared by the forms and by both repository implementations, so a
 * rule can never hold in the UI and not in the data layer. Messages are written
 * for the player, because they are rendered straight under the field.
 *
 * TOR 3 (ระบบสมาชิกและเข้าสู่ระบบ) is what these encode: email format is
 * checked, the email is fixed at registration, and the display name is what
 * appears on the leaderboard -- never the email.
 */

import { z } from 'zod';

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 24;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export const emailSchema = z
  .string()
  // Case and surrounding space are not meaningful in an address, and letting
  // them through would allow two accounts that read identically. Normalising
  // BEFORE the format check matters: a pasted address with a trailing space is
  // a valid address, and rejecting it would be a bug, not a validation.
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ message: 'Enter a valid email address' })
      .max(254, { message: 'That email address is too long' }),
  );

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, { message: `Password must be at least ${PASSWORD_MIN} characters` })
  .max(PASSWORD_MAX, { message: `Password must be ${PASSWORD_MAX} characters or fewer` });

export const displayNameSchema = z
  .string()
  .trim()
  .min(DISPLAY_NAME_MIN, { message: `Display name must be at least ${DISPLAY_NAME_MIN} characters` })
  .max(DISPLAY_NAME_MAX, { message: `Display name must be ${DISPLAY_NAME_MAX} characters or fewer` });

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Enter your password' }),
});

export const profileEditSchema = z.object({
  displayName: displayNameSchema,
});

export type RegisterForm = z.infer<typeof registerSchema>;
export type LoginForm = z.infer<typeof loginSchema>;
export type ProfileEditForm = z.infer<typeof profileEditSchema>;

/**
 * Flattens a Zod failure into `{ field: message }`, which is the shape the form
 * components render. Only the first message per field is kept -- a field shows
 * one error at a time.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== 'string' || key in result) continue;
    result[key] = issue.message;
  }
  return result;
}
