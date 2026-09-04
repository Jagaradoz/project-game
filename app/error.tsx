'use client';

import { useEffect } from 'react';

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
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col justify-center gap-4 p-4">
      <h1 className="m-0 text-2xl font-bold">Something went wrong</h1>
      <p className="m-0 text-sm text-muted">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="min-h-12 max-w-[220px] cursor-pointer rounded-lg border-0 bg-accent px-4 py-3 font-semibold text-[#04121a]"
      >
        Try again
      </button>
    </main>
  );
}
