'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { PlayerAvatar } from '@/components/account/PlayerAvatar';
import { LinkButton } from '@/components/ui/Button';
import { SHELL_GUTTER, SHELL_WIDTH } from '@/components/layout/container';
import { Wordmark } from '@/components/layout/Wordmark';
import { STUDY_NAV, type NavLink, type NavVariant } from '@/components/layout/nav';
import { useSession } from '@/hooks/useSession';
import { avatarSeedFor } from '@/lib/avatar';

interface SiteHeaderProps {
  /** 'study' strips every game affordance from the chrome. See nav.ts. */
  variant?: NavVariant;
  /** The gameplay screen already is the call to action. */
  hasCta?: boolean;
}

/**
 * The nav is resolved here rather than passed in: each link carries an icon
 * COMPONENT, and a function cannot cross the server -> client prop boundary. A
 * server page hands over the variant name, and this file looks the rest up.
 */
export function SiteHeader({ variant = 'game', hasCta = variant === 'game' }: SiteHeaderProps) {
  const isStudy = variant === 'study';
  const links = isStudy ? STUDY_NAV : [];

  const pathname = usePathname();
  const { session, isLoading } = useSession();
  const isGuest = !isLoading && session === null;

  /**
   * The route the drawer was opened on, rather than a boolean.
   *
   * Navigating away has to close it -- otherwise it stays open over the page the
   * player just asked for -- and deriving "open" from the current route does
   * that without an effect that sets state on every navigation.
   */
  const [openedAtPath, setOpenedAtPath] = useState<string | null>(null);
  const isMenuOpen = openedAtPath === pathname;

  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    // The page behind an open drawer must not scroll under it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenedAtPath(null);
        triggerRef.current?.focus();
        return;
      }

      // Keep Tab inside the panel: a drawer whose focus escapes to the page
      // underneath is unusable by keyboard even though it looks correct.
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>('a[href], button');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isMenuOpen]);

  const profileIsActive = pathname.startsWith('/profile') || pathname.startsWith('/leaderboard');

  return (
    <header className="sticky top-0 z-30 border-t-[6px] border-b-2 border-ink bg-surface">
      <div className={`mx-auto flex h-16 ${SHELL_WIDTH.wide} items-center gap-2 ${SHELL_GUTTER}`}>
        <Wordmark priority />

        {isStudy ? (
          <nav aria-label="Main" className="ml-auto hidden items-center gap-0.5 lg:flex">
            {links.map((link) => (
              <NavItem key={link.href} link={link} pathname={pathname} />
            ))}
          </nav>
        ) : (
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {isLoading && <div aria-hidden className="h-9 w-36" />}

            {isGuest && (
              <>
                <Link
                  href="/register"
                  className="inline-flex min-h-9 items-center px-2.5 text-sm font-extrabold text-ink no-underline underline-offset-4 hover:underline"
                >
                  Sign up
                </Link>
                <LinkButton href="/login" variant="primary" size="sm">
                  Login
                </LinkButton>
              </>
            )}

            {session && (
              <>
                <Link
                  href="/profile"
                  aria-label="Profile"
                  aria-current={profileIsActive ? 'page' : undefined}
                  className={`overflow-hidden border-2 border-ink transition-opacity ${
                    profileIsActive ? 'ring-2 ring-primary ring-offset-2 ring-offset-bg' : 'hover:opacity-80'
                  }`}
                >
                  <PlayerAvatar
                    seed={avatarSeedFor(session.user)}
                    name={session.user.displayName}
                    size="sm"
                    decorative
                  />
                </Link>
                {hasCta && (
                  <LinkButton href="/play" variant="primary" size="sm" icon={<Play size={15} />}>
                    Play
                  </LinkButton>
                )}
              </>
            )}
          </div>
        )}

        {isStudy && (
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpenedAtPath((current) => (current === pathname ? null : pathname))}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            className="ml-auto grid size-11 cursor-pointer place-items-center rounded-none border-2 border-ink bg-primary text-ink shadow-[3px_3px_0_var(--color-ink)] transition-colors hover:bg-primary-hover lg:hidden"
          >
            {isMenuOpen ? <X aria-hidden size={20} /> : <Menu aria-hidden size={20} />}
          </button>
        )}
      </div>

      {isStudy && isMenuOpen && (
        <div
          id="mobile-nav"
          ref={panelRef}
          className="border-t-2 border-ink bg-surface lg:hidden"
        >
          <nav aria-label="Main" className={`mx-auto flex ${SHELL_WIDTH.wide} flex-col p-3 sm:px-6`}>
            {links.map((link) => (
              <NavItem key={link.href} link={link} pathname={pathname} isStacked />
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

function NavItem({
  link,
  pathname,
  isStacked,
}: {
  link: NavLink;
  pathname: string;
  isStacked?: boolean;
}) {
  // "/" would otherwise prefix-match every route, marking Home active everywhere.
  const isActive = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
  const Icon = link.icon;

  return (
    <Link
      href={link.href}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-2 rounded-none font-bold transition-colors duration-150 ${
        isStacked ? 'min-h-12 px-3 py-3 text-base' : 'px-3 py-1.5 text-sm'
      } ${isActive ? 'border-2 border-ink bg-primary text-ink' : 'border-2 border-transparent text-ink hover:border-ink hover:bg-elevated'}`}
    >
      <Icon aria-hidden size={isStacked ? 18 : 15} />
      {link.label}
    </Link>
  );
}
