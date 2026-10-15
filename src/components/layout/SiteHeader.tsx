'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SHELL_GUTTER, SHELL_WIDTH } from '@/components/layout/container';
import { Wordmark } from '@/components/layout/Wordmark';
import { GAME_NAV, STUDY_NAV, type NavLink, type NavVariant } from '@/components/layout/nav';

interface SiteHeaderProps {
  variant?: NavVariant;
  hasCta?: boolean;
}

export function SiteHeader({ variant = 'game' }: SiteHeaderProps) {
  const links = variant === 'study' ? STUDY_NAV : GAME_NAV;
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
        <nav aria-label="Main" className="ml-auto hidden items-center gap-0.5 lg:flex">
          {links.map((link) => <NavItem key={link.href} link={link} pathname={pathname} />)}
        </nav>
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
            {links.map((link) => <NavItem key={link.href} link={link} pathname={pathname} isStacked />)}
          </nav>
        </div>
      )}
    </header>
  );
}

function NavItem({ link, pathname, isStacked }: { link: NavLink; pathname: string; isStacked?: boolean }) {
  const isActive = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
  const Icon = link.icon;
  return (
    <Link href={link.href} aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-2 rounded-none border-2 font-bold transition-colors ${isStacked ? 'min-h-12 px-3 py-3 text-base' : 'px-3 py-1.5 text-sm'} ${isActive ? 'border-ink bg-primary text-ink' : 'border-transparent text-ink hover:border-ink hover:bg-elevated'}`}>
      <Icon aria-hidden size={isStacked ? 18 : 15} />{link.label}
    </Link>
  );
}
