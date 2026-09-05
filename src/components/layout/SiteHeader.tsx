'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { LinkButton } from '@/components/ui/Button';
import { Wordmark } from '@/components/layout/Wordmark';
import { GAME_NAV, STUDY_NAV, type NavLink, type NavVariant } from '@/components/layout/nav';

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
  const links = variant === 'study' ? STUDY_NAV : GAME_NAV;

  const pathname = usePathname();

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

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Wordmark />

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <NavItem key={link.href} link={link} pathname={pathname} />
          ))}
        </nav>

        {hasCta && (
          <LinkButton
            href="/play"
            variant="primary"
            size="sm"
            icon={<Play size={16} />}
            className="ml-auto lg:ml-2"
          >
            Play
          </LinkButton>
        )}

        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpenedAtPath((current) => (current === pathname ? null : pathname))}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-nav"
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          className={`grid size-11 cursor-pointer place-items-center rounded-lg border border-line-strong text-text transition-colors hover:bg-surface lg:hidden ${
            hasCta ? '' : 'ml-auto'
          }`}
        >
          {isMenuOpen ? <X aria-hidden size={20} /> : <Menu aria-hidden size={20} />}
        </button>
      </div>

      {isMenuOpen && (
        <div
          id="mobile-nav"
          ref={panelRef}
          className="border-t border-line bg-bg lg:hidden"
        >
          <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-col p-3 sm:px-6">
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
      className={`flex items-center gap-2 rounded-lg font-medium transition-colors ${
        isStacked ? 'min-h-12 px-3 py-3 text-base' : 'px-3 py-2 text-sm'
      } ${isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface hover:text-text'}`}
    >
      <Icon aria-hidden size={isStacked ? 18 : 16} />
      {link.label}
    </Link>
  );
}
