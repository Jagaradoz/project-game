import { LoaderCircle } from 'lucide-react';

export default function Loading() {
  return (
    <main className="mx-auto grid min-h-dvh place-content-center justify-items-center gap-3 px-4">
      <LoaderCircle aria-hidden size={28} className="animate-spin text-primary" />
      <p role="status" className="m-0 text-sm text-muted">
        Loading…
      </p>
    </main>
  );
}
