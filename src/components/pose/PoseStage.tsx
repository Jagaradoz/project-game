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
  idleLabel = 'กล้องยังไม่เปิด',
}: PoseStageProps) {
  return (
    <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl border border-line bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="mirrored absolute inset-0 h-full w-full object-cover"
      />
      <canvas ref={overlayRef} className="mirrored absolute inset-0 h-full w-full" />

      {!isCameraRunning && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted">
          {idleLabel}
        </div>
      )}
    </div>
  );
}
