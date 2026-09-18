import { Compass, House, Map } from 'lucide-react';

import { LinkButton } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-4 text-center">
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary"
      >
        <Compass size={22} />
      </span>

      <h1 className="m-0 text-2xl font-semibold tracking-tight">This trail doesn&rsquo;t exist</h1>
      <p className="m-0 text-sm leading-relaxed text-muted">
        The page you were looking for isn&rsquo;t here. It may have moved, or the link may be wrong.
      </p>

      <div className="flex flex-col gap-3 self-stretch sm:flex-row sm:self-auto">
        <LinkButton href="/" variant="primary" icon={<House size={18} />}>
          Back to home
        </LinkButton>
        <LinkButton href="/stages" icon={<Map size={18} />}>
          Browse stages
        </LinkButton>
      </div>
    </main>
  );
}
