import type { NextRequest } from 'next/server';

import { accountService, handle, respond, sessionToken } from '@/server/http';

export function POST(request: NextRequest) {
  return handle('logout', async () => respond(request, await accountService().logout(sessionToken(request))));
}
