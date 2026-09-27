'use client';

import { House, RotateCcw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { Button, LinkButton } from '@/components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-4 text-center">
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-none bg-danger-soft text-danger"
      >
        <TriangleAlert size={22} />
      </span>

      <h1 className="m-0 text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="m-0 text-sm leading-relaxed text-muted">{error.message}</p>

      <div className="flex flex-col gap-3 self-stretch sm:flex-row sm:self-auto">
        <Button onClick={reset} icon={<RotateCcw size={18} />}>
          Try again
        </Button>
        <LinkButton href="/" icon={<House size={18} />}>
          Back to home
        </LinkButton>
      </div>
    </main>
  );
}
