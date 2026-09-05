import Link from 'next/link';
import { Footprints } from 'lucide-react';

/** The brand lockup, in the header and the footer. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex flex-none items-center gap-2 font-display text-xl font-bold tracking-wide text-text no-underline ${className}`}
    >
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-lg bg-primary text-on-primary"
      >
        <Footprints size={18} />
      </span>
      Trail Runner
    </Link>
  );
}
