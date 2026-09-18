import Link from 'next/link';
import Image from 'next/image';

/** The brand lockup, in the header and the footer. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex flex-none items-center gap-2.5 font-display text-xl font-bold tracking-wide text-text no-underline transition-opacity hover:opacity-90 ${className}`}
    >
      <span
        aria-hidden
        className="relative grid size-8 place-items-center overflow-hidden rounded-lg shadow-sm ring-1 ring-white/10"
      >
        <Image
          src="/icon.png"
          alt=""
          width={32}
          height={32}
          priority
          className="size-full object-cover"
        />
      </span>
      Trail Runner
    </Link>
  );
}

