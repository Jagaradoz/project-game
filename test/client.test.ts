import { expect, test } from 'vitest';
import { ApiError, getErrorMessage } from '@/lib/api/client';

test('getErrorMessage safely presents known errors and unknown failures', () => {
  expect(getErrorMessage(new ApiError('Invalid run', 400))).toBe('Invalid run');
  expect(getErrorMessage(new Error('Failed'))).toBe('Failed');
  expect(getErrorMessage(null)).toBe('Unexpected error');
  expect(getErrorMessage('untrusted')).toBe('Unexpected error');
});
