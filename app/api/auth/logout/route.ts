import type { NextRequest } from 'next/server';

import { accountService, handle, respond, sessionToken } from '@/server/http';

export function POST(request: NextRequest) {
  return handle('logout', () => respond(request, accountService().logout(sessionToken(request))));
}
