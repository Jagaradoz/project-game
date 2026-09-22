'use client';

import { Scan, VideoOff } from 'lucide-react';
import { useState, type RefObject } from 'react';

interface CameraStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  isCameraRunning: boolean;
}

/**
 * The webcam, demoted to a corner thumbnail: enough to confirm tracking, small
 * enough that the road owns the screen.
 *
 * The mirror lives in `mirrored`, applied to BOTH the video and the overlay, so
 * the skeleton stays glued to the body without any flipping in the drawing code.
 * Changing one without the other detaches the skeleton -- see app/globals.css.
 */
export function CameraStage({ videoRef, overlayRef, isCameraRunning }: CameraStageProps) {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const showFeed = isCameraRunning && isVideoReady;

  return (
    <div
      className={`absolute right-3 bottom-3 z-[2] overflow-hidden border bg-[rgba(10,12,15,0.82)] shadow-[0_6px_20px_rgba(0,0,0,0.3)] backdrop-blur-[3px] transition-[width,height,border-radius] duration-200 motion-reduce:transition-none ${
        showFeed
          ? 'aspect-9/16 w-[72px] rounded-lg border-white/20 sm:w-[84px]'
          : 'h-9 w-[116px] rounded-full border-white/15'
      }`}
      role="status"
      aria-label={showFeed ? 'Body tracking camera active' : 'Body tracking camera unavailable'}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        onLoadedData={() => setIsVideoReady(true)}
        onPlaying={() => setIsVideoReady(true)}
        onEmptied={() => setIsVideoReady(false)}
        onPause={() => setIsVideoReady(false)}
        onEnded={() => setIsVideoReady(false)}
        className={`mirrored absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${showFeed ? 'opacity-100' : 'opacity-0'}`}
      />
      <canvas
        ref={overlayRef}
        className={`mirrored absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${showFeed ? 'opacity-100' : 'opacity-0'}`}
      />
      {showFeed ? (
        <div className="absolute inset-x-1.5 top-1.5 flex items-center justify-center gap-1 rounded-full bg-black/65 px-1.5 py-1">
          <span aria-hidden className="size-1.5 rounded-full bg-ok shadow-[0_0_5px_rgba(34,197,94,0.9)]" />
          <span className="text-[8px] font-bold tracking-[0.12em] text-white uppercase">Tracking</span>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center gap-2 px-3 text-white/75">
          {isCameraRunning ? (
            <Scan aria-hidden size={15} className="shrink-0 text-warn" />
          ) : (
            <VideoOff aria-hidden size={15} className="shrink-0 text-white/50" />
          )}
          <span className="text-[9px] font-bold tracking-[0.1em] whitespace-nowrap uppercase">
            {isCameraRunning ? 'Starting tracking' : 'Tracking off'}
          </span>
        </div>
      )}
    </div>
  );
}
