import Link from 'next/link';
import Image from 'next/image';

/** The brand lockup, in the header and the footer. */
export function Wordmark({
  className = '',
  priority = false,
}: {
  className?: string;
  /** Only the header mark is above the fold. */
  priority?: boolean;
}) {
  return (
    <Link
      href="/"
      className={`flex flex-none items-center gap-2 text-[0.95rem] font-semibold tracking-tight text-text no-underline transition-opacity hover:opacity-90 ${className}`}
    >
      <span
        aria-hidden
        className="relative size-6 overflow-hidden rounded-md ring-1 ring-white/10"
      >
        <Image
          src="/icon.png"
          alt=""
          width={24}
          height={24}
          priority={priority}
          className="size-full object-cover"
        />
      </span>
      Trail Runner
    </Link>
  );
}
