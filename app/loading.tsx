import Image from 'next/image';
import { LoaderCircle } from 'lucide-react';

export default function Loading() {
  return (
    <main className="mx-auto grid min-h-dvh place-content-center justify-items-center gap-4 px-4 text-center">
      <div className="relative size-10 overflow-hidden rounded-md ring-1 ring-white/10">
        <Image
          src="/icon.png"
          alt="Trail Runner"
          width={40}
          height={40}
          priority
          className="size-full object-cover"
        />
      </div>
      <div className="flex items-center gap-2 text-muted">
        <LoaderCircle aria-hidden size={18} className="animate-spin text-primary" />
        <p role="status" className="m-0 text-sm font-medium">
          Loading…
        </p>
      </div>
    </main>
  );
}
