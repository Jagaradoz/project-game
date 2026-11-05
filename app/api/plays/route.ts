import type { NextRequest } from 'next/server';

import { accountService, handle, readJson, respond, sessionToken } from '@/server/http';

export function GET(request: NextRequest) {
  return handle('plays', async () => respond(request, await accountService().plays(sessionToken(request))));
}

export function POST(request: NextRequest) {
  return handle('add play', async () => {
    const parsed = await readJson(request);
    if (!parsed.ok) return parsed.response;
    return respond(request, await accountService().addPlay(sessionToken(request), parsed.body));
  });
}
