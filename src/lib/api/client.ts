/**
 * The HTTP client every page goes through.
 *
 * Two rules it enforces so pages do not have to: the base URL comes from the
 * environment (never hardcoded), and every response is validated at the boundary
 * before any component sees it.
 */

import { z } from 'zod';

import type { ApiResponse } from '@/types/api';

export const API_MODE = process.env.NEXT_PUBLIC_API_MODE ?? 'mock';
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
}

/** Wraps the payload schema in the envelope every endpoint responds with. */
function envelope<T>(schema: z.ZodType<T>) {
  return z.object({
    success: z.boolean(),
    data: schema.nullable(),
    error: z.string().nullable(),
    meta: z
      .object({ total: z.number(), page: z.number(), limit: z.number() })
      .optional(),
  });
}

export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, schema, signal }: RequestOptions<T>,
): Promise<ApiResponse<T>> {
  if (!BASE_URL) {
    throw new ApiError(
      'NEXT_PUBLIC_API_BASE_URL is not set. Use the mock adapter until the API is available.',
      0,
    );
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      // The session cookie is issued by the backend; never read here.
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error: unknown) {
    throw new ApiError(getErrorMessage(error), 0);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(`The server returned a non-JSON response (${response.status}).`, response.status);
  }

  const parsed = envelope(schema).safeParse(payload);
  if (!parsed.success) {
    throw new ApiError('The server response did not match the expected shape.', response.status);
  }

  if (!response.ok || !parsed.data.success) {
    throw new ApiError(parsed.data.error ?? `Request failed (${response.status}).`, response.status);
  }

  return parsed.data as ApiResponse<T>;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}
