import type { NextRequest } from 'next/server';

import { accountService, clientKey, handle, readJson, respond } from '@/server/http';

export function POST(request: NextRequest) {
  return handle('register', async () => {
    const parsed = await readJson(request);
    if (!parsed.ok) return parsed.response;
    return respond(request, accountService().register(parsed.body, clientKey(request)));
  });
}
