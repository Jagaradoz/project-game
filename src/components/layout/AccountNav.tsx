'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, UserRound } from 'lucide-react';
import { useEffect } from 'react';

import { Button, LinkButton } from '@/components/ui/Button';
import { useAccount } from '@/lib/store/account';

/**
 * Log in / account controls in the site header. Compact beside the nav on wide
 * screens (the header row is already full), spelled out inside the menu panel
 * on narrow ones.
 */
export function AccountNav({ isStacked }: { isStacked?: boolean }) {
  const router = useRouter();
  const status = useAccount((s) => s.status);
  const username = useAccount((s) => s.username);
  const refresh = useAccount((s) => s.refresh);
  const logout = useAccount((s) => s.logout);

  useEffect(() => {
    if (useAccount.getState().status === 'unknown') void refresh();
  }, [refresh]);

  const onLogout = async () => {
    await logout();
    router.push('/');
  };

  // Render nothing until the first check: no "Log in" flash for a logged-in player.
  if (status === 'unknown') return null;

  if (isStacked) {
    return (
      <div className="mt-2 flex flex-col gap-2 border-t-2 border-ink pt-3">
        {status === 'guest' ? <>
          <LinkButton href="/login" variant="secondary" isFullWidth>Log in</LinkButton>
          <LinkButton href="/register" variant="primary" isFullWidth>Register</LinkButton>
        </> : <>
          <LinkButton href="/stats" variant="secondary" icon={<UserRound size={18} />} isFullWidth>
            {username} · My stats
          </LinkButton>
          <Button variant="secondary" icon={<LogOut size={18} />} onClick={onLogout} isFullWidth>Log out</Button>
        </>}
      </div>
    );
  }

  if (status === 'guest') {
    return <LinkButton href="/login" size="sm" variant="primary" className="whitespace-nowrap">Log in</LinkButton>;
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <Link href="/stats" title="My stats"
        className="inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-ink no-underline hover:underline hover:decoration-primary hover:decoration-2 hover:underline-offset-4">
        <UserRound aria-hidden size={16} />
        <span className="max-w-[8rem] truncate">{username}</span>
      </Link>
      <button type="button" onClick={onLogout} aria-label="Log out" title="Log out"
        className="grid size-9 cursor-pointer place-items-center border-2 border-ink bg-surface text-ink shadow-[2px_2px_0_var(--color-ink)] hover:bg-elevated">
        <LogOut aria-hidden size={16} />
      </button>
    </div>
  );
}
