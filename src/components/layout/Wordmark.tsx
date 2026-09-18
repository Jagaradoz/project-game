import Link from 'next/link';
import Image from 'next/image';

/** The brand lockup in the header. */
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
      className={`flex flex-none items-center gap-2.5 text-[1.1rem] font-bold tracking-tight text-text no-underline transition-opacity hover:opacity-90 sm:text-[1.2rem] ${className}`}
    >
      <span
        aria-hidden
        className="relative size-7 overflow-hidden rounded-lg ring-1 ring-white/10 sm:size-8"
      >
        <Image
          src="/icon.png"
          alt=""
          width={32}
          height={32}
          priority={priority}
          className="size-full object-cover"
        />
      </span>
      Webcam <span className="text-primary">Exergame</span>
    </Link>
  );
}
