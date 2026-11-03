import type { NextRequest } from 'next/server';

import { accountService, clientKey, handle, readJson, respond } from '@/server/http';

export function POST(request: NextRequest) {
  return handle('login', async () => {
    const parsed = await readJson(request);
    if (!parsed.ok) return parsed.response;
    return respond(request, accountService().login(parsed.body, clientKey(request)));
  });
}
