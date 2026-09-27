import { critterSrc } from '@/lib/avatar';

type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: 'size-9',
  md: 'size-14',
  lg: 'size-20 sm:size-24',
};

interface PlayerAvatarProps {
  seed: string;
  /** Spoken name of the player; the image is otherwise decorative. */
  name: string;
  size?: AvatarSize;
  className?: string;
  decorative?: boolean;
}

/**
 * A DiceBear Critter in a circle. SVG from the HTTP API, so next/image is the
 * wrong tool -- it does not optimize SVG and would need a remote-host exception.
 */
export function PlayerAvatar({
  seed,
  name,
  size = 'md',
  className = '',
  decorative = false,
}: PlayerAvatarProps) {
  return (
    <span
      className={`inline-flex flex-none overflow-hidden rounded-none bg-elevated ${SIZE_CLASS[size]} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={critterSrc(seed)}
        alt={decorative ? '' : `${name}'s avatar`}
        width={128}
        height={128}
        className="size-full object-cover"
        draggable={false}
      />
    </span>
  );
}
