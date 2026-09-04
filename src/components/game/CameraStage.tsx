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
    <div className="absolute top-2.5 right-2.5 z-[2] aspect-4/3 w-[130px] overflow-hidden rounded-lg border border-[#2c343d] bg-black opacity-90">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="mirrored absolute inset-0 h-full w-full object-cover"
      />
      <canvas ref={overlayRef} className="mirrored absolute inset-0 h-full w-full" />
      {!isCameraRunning && (
        <div className="absolute inset-0 grid place-items-center p-2 text-center text-xs text-muted">
          Camera off
        </div>
      )}
    </div>
  );
}
