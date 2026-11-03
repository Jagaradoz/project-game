import type { NextRequest } from 'next/server';

import { accountService, handle, respond, sessionToken } from '@/server/http';

export function GET(request: NextRequest) {
  return handle('me', () => respond(request, accountService().me(sessionToken(request))));
}
