import { VideoOff } from 'lucide-react';
import type { RefObject } from 'react';

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
  return (
    <div className="absolute top-3 right-3 z-[2] aspect-4/3 w-[120px] overflow-hidden rounded-lg border border-white/15 bg-black shadow-lg sm:w-[150px]">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="mirrored absolute inset-0 h-full w-full object-cover"
      />
      <canvas ref={overlayRef} className="mirrored absolute inset-0 h-full w-full" />
      {!isCameraRunning && (
        <div className="absolute inset-0 grid place-content-center justify-items-center gap-1 p-2 text-center">
          <VideoOff aria-hidden size={16} className="text-subtle" />
          <span className="text-[11px] text-muted">Camera off</span>
        </div>
      )}
    </div>
  );
}
