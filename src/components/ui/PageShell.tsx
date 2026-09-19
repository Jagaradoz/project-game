import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SHELL_GUTTER, SHELL_WIDTH, type ShellWidth } from '@/components/layout/container';
import type { NavVariant } from '@/components/layout/nav';

export type { NavVariant, ShellWidth };

interface PageShellProps {
  title: string;
  /** Quiet label above the heading -- the screen's place in the product. */
  eyebrow?: string;
  /** One line under the heading, saying what this screen is for. */
  subtitle?: string;
  /** 'study' strips every game affordance from the chrome. See nav.ts. */
  nav?: NavVariant;
  width?: ShellWidth;
  /** Controls that belong to the page, beside its heading. */
  actions?: React.ReactNode;
  /**
   * Skip the eyebrow/title/subtitle header when the page supplies its own
   * heading -- profile uses the display name as the <h1>.
   */
  heading?: boolean;
  children?: React.ReactNode;
}

export function PageShell({
  title,
  eyebrow,
  subtitle,
  nav = 'game',
  width = 'prose',
  actions,
  heading = true,
  children,
}: PageShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader variant={nav} />

      <main
        className={`mx-auto flex w-full flex-col gap-6 py-8 sm:py-10 ${SHELL_GUTTER} ${SHELL_WIDTH[width]}`}
      >
        {heading && (
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              {eyebrow && <span className="eyebrow">{eyebrow}</span>}
              <h1 className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
              {subtitle && <p className="m-0 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </header>
        )}

        {children}
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * A page that supplies its own hero instead of the standard heading -- the
 * landing page. Same chrome, no <header>. `bleed` drops the column so a
 * cinematic hero can run edge to edge; inner sections re-apply the gutter.
 */
export function BareShell({
  width = 'wide',
  bleed = false,
  children,
}: {
  width?: ShellWidth;
  bleed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main
        className={
          bleed ? 'w-full' : `mx-auto w-full ${SHELL_GUTTER} ${SHELL_WIDTH[width]}`
        }
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
