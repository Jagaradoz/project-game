import { VideoOff } from 'lucide-react';
import type { RefObject } from 'react';

interface PoseStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  isCameraRunning: boolean;
  /** Shown over the video when the camera is off. */
  idleLabel?: string;
}

/**
 * The camera at full size, with the skeleton drawn over it. /calibrate and
 * /practice both need the player to actually SEE their tracking, which is the
 * opposite of the corner thumbnail /play uses (see CameraStage.tsx).
 *
 * The mirror lives in `.mirrored` and is applied to BOTH the video and the
 * overlay, so draw.ts does no flipping of its own. Change one without the other
 * and the skeleton detaches from the body -- see app/globals.css.
 */
export function PoseStage({
  videoRef,
  overlayRef,
  isCameraRunning,
  idleLabel = 'The camera is not on',
}: PoseStageProps) {
  return (
    <div className="relative aspect-4/3 w-full overflow-hidden rounded-none border-2 border-ink bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="mirrored absolute inset-0 h-full w-full object-cover"
      />
      <canvas ref={overlayRef} className="mirrored absolute inset-0 h-full w-full" />

      {!isCameraRunning && (
        <div className="absolute inset-0 grid place-content-center justify-items-center gap-3 p-4 text-center">
          <VideoOff aria-hidden size={28} className="text-white/70" />
          <p className="m-0 max-w-xs text-sm text-white/80">{idleLabel}</p>
        </div>
      )}
    </div>
  );
}
