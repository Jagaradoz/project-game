'use client';

import Image from 'next/image';
import { useState } from 'react';

import { STILL_FALLBACK } from '@/lib/media/stills';

interface TrailStillProps {
  src: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  priority?: boolean;
  sizes?: string;
  className?: string;
  /** Required for SVG sources — next/image does not optimize them. */
  unoptimized?: boolean;
}

/**
 * A trail photograph. Missing captures (before `shot.mjs` has run) fall back to
 * the brand illustration rather than a broken image.
 */
export function TrailStill({
  src,
  alt,
  fill,
  width,
  height,
  priority,
  sizes,
  className = '',
  unoptimized,
}: TrailStillProps) {
  const [failed, setFailed] = useState(false);
  const resolved = failed ? STILL_FALLBACK : src;
  const skipOptimize = unoptimized ?? resolved.endsWith('.svg');

  if (fill) {
    return (
      <Image
        src={resolved}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        unoptimized={skipOptimize}
        onError={() => setFailed(true)}
        className={className}
      />
    );
  }

  return (
    <Image
      src={resolved}
      alt={alt}
      width={width ?? 640}
      height={height ?? 800}
      priority={priority}
      sizes={sizes}
      unoptimized={skipOptimize}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
