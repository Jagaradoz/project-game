import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import type { NavVariant } from '@/components/layout/nav';

export type { NavVariant };

/**
 * How wide the content runs. Prose and forms stay narrow enough to read; grids
 * of stats, stages and table rows get the full width.
 */
export type ShellWidth = 'narrow' | 'prose' | 'wide';

const WIDTH_CLASS: Record<ShellWidth, string> = {
  narrow: 'max-w-md',
  prose: 'max-w-3xl',
  wide: 'max-w-6xl',
};

interface PageShellProps {
  title: string;
  /** One line under the heading, saying what this screen is for. */
  subtitle?: string;
  /** 'study' strips every game affordance from the chrome. See nav.ts. */
  nav?: NavVariant;
  width?: ShellWidth;
  /** Controls that belong to the page, beside its heading. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageShell({
  title,
  subtitle,
  nav = 'game',
  width = 'prose',
  actions,
  children,
}: PageShellProps) {
  const isStudy = nav === 'study';

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader variant={nav} />

      <main
        className={`mx-auto flex w-full flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8 ${WIDTH_CLASS[width]}`}
      >
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-3xl font-bold sm:text-4xl">{title}</h1>
            {subtitle && <p className="m-0 max-w-2xl text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>

        {children}
      </main>

      <SiteFooter hasLinks={!isStudy} />
    </div>
  );
}

/**
 * A page that supplies its own hero instead of the standard heading -- the
 * landing page. Same chrome, no <header>.
 */
export function BareShell({
  width = 'wide',
  children,
}: {
  width?: ShellWidth;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${WIDTH_CLASS[width]}`}>{children}</main>
      <SiteFooter />
    </div>
  );
}
