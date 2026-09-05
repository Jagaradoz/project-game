import { Notice } from '@/components/ui/Notice';
import { IS_MOCK_MODE } from '@/lib/api';

/**
 * Says plainly that the account is local.
 *
 * A login form that looks real but is not is worse than no login form: a player
 * could reasonably reuse a real password in it. TOR 5 gives auth to the backend,
 * so until that exists this notice appears on every account screen.
 *
 * It renders nothing in live mode, so it disappears on its own.
 */
export function LocalAccountNotice() {
  if (!IS_MOCK_MODE) return null;

  return (
    <Notice tone="warn" title="This account is stored only in this browser">
      Real accounts arrive with the backend. For now your account and statistics live on this device,
      are never sent to a server, and will be lost if you clear your browser data.
      <strong className="block pt-1">
        Please do not reuse a password you use for any other service.
      </strong>
    </Notice>
  );
}
