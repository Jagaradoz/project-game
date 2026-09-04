import Link from 'next/link';

interface PageShellProps {
  title: string;
  /** The TOR clause this screen satisfies, kept visible while the app is a skeleton. */
  tor?: string;
  children?: React.ReactNode;
}

export function PageShell({ title, tor, children }: PageShellProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col gap-4 p-4">
      <nav className="flex flex-wrap gap-3 text-[13px] text-muted">
        <Link href="/" className="hover:text-accent">
          Home
        </Link>
        <Link href="/calibrate" className="hover:text-accent">
          Calibrate
        </Link>
        <Link href="/stages" className="hover:text-accent">
          Stages
        </Link>
        <Link href="/play" className="hover:text-accent">
          Play
        </Link>
        <Link href="/profile" className="hover:text-accent">
          Profile
        </Link>
        <Link href="/leaderboard" className="hover:text-accent">
          Leaderboard
        </Link>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold">{title}</h1>
        {tor && <p className="m-0 text-[13px] text-muted">{tor}</p>}
      </header>

      {children}
    </main>
  );
}

/** Marks a route that exists structurally but has no content yet. */
export function NotBuiltYet({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-dashed border-line bg-panel p-4 text-sm text-muted">
      {children}
    </section>
  );
}
