import type { NextRequest } from 'next/server';

import { accountService, handle, respond, sessionToken } from '@/server/http';

export function GET(request: NextRequest) {
  return handle('me', async () => respond(request, await accountService().me(sessionToken(request))));
}
