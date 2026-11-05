'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SHELL_GUTTER, SHELL_WIDTH } from '@/components/layout/container';
import { Wordmark } from '@/components/layout/Wordmark';
import { AccountNav } from '@/components/layout/AccountNav';
import { NAV_LINKS, type NavLink } from '@/components/layout/nav';

export function SiteHeader() {
  const pathname = usePathname();
  const [openedAtPath, setOpenedAtPath] = useState<string | null>(null);
  const isMenuOpen = openedAtPath === pathname;
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenedAtPath(null);
        triggerRef.current?.focus();
        return;
      }
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
    <header className="sticky top-0 z-30 border-t-[6px] border-b-2 border-ink bg-surface">
      <div className={`mx-auto flex h-16 ${SHELL_WIDTH.wide} items-center gap-2 ${SHELL_GUTTER}`}>
        <Wordmark priority />
        <nav aria-label="Main" className="ml-auto hidden h-full items-stretch gap-7 lg:flex">
          {NAV_LINKS.map((link) => <NavItem key={link.href} link={link} pathname={pathname} />)}
        </nav>
        <div className="ml-6 hidden lg:flex"><AccountNav /></div>
        <button ref={triggerRef} type="button"
          onClick={() => setOpenedAtPath((current) => current === pathname ? null : pathname)}
          aria-expanded={isMenuOpen} aria-controls="mobile-nav"
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          className="ml-auto grid size-11 cursor-pointer place-items-center border-2 border-ink bg-primary text-ink shadow-[3px_3px_0_var(--color-ink)] hover:bg-primary-hover lg:hidden">
          {isMenuOpen ? <X aria-hidden size={20} /> : <Menu aria-hidden size={20} />}
        </button>
      </div>
      {isMenuOpen && (
        <div id="mobile-nav" ref={panelRef} className="border-t-2 border-ink bg-surface lg:hidden">
          <nav aria-label="Main" className={`mx-auto flex ${SHELL_WIDTH.wide} flex-col p-3 sm:px-6`}>
            {NAV_LINKS.map((link) => <NavItem key={link.href} link={link} pathname={pathname} isStacked />)}
            <AccountNav isStacked />
          </nav>
        </div>
      )}
    </header>
  );
}

function NavItem({ link, pathname, isStacked }: { link: NavLink; pathname: string; isStacked?: boolean }) {
  const isActive = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
  const stateClass = isStacked
    ? (isActive ? 'border-ink bg-primary' : 'border-transparent hover:border-ink hover:bg-elevated')
    : (isActive ? 'border-b-primary' : 'border-b-transparent hover:border-b-primary-soft');
  return (
    <Link href={link.href} aria-current={isActive ? 'page' : undefined}
      className={`flex items-center whitespace-nowrap font-bold text-ink transition-colors ${isStacked ? 'min-h-12 border-2 px-3 py-3 text-base' : 'border-b-[5px] pt-[5px] text-sm'} ${stateClass}`}>
      {link.label}
    </Link>
  );
}
