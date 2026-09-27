import { Crosshair, Video, VideoOff } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { LATERAL } from '@/engine/detectors/lateral';
import type { HudSnapshot } from '@/engine/runtime';

interface DetectorDebugPanelProps {
  snapshot: HudSnapshot;
  onStartCamera: () => void | Promise<void>;
  onStopCamera: () => void;
  onRecalibrate: () => void;
}

/**
 * The measurement surface for TOR 3.4: detector state, inference latency and
 * frame rate, which is what the technical evaluation is reported from.
 *
 * Collapsed by default, and only mounted from /play when debug tools are on --
 * it is an instrument, not part of playing.
 */
export function DetectorDebugPanel({
  snapshot,
  onStartCamera,
  onStopCamera,
  onRecalibrate,
}: DetectorDebugPanelProps) {
  const lateralText = !snapshot.hasBody
    ? 'NO BODY'
    : !snapshot.isCalibrated
      ? 'CALIBRATING'
      : snapshot.lateralLabel;

  return (
    <details className="rounded-none border-2 border-ink bg-surface px-4 py-3">
      <summary className="cursor-pointer text-[13px] font-semibold tracking-[0.04em] text-muted uppercase">
        Camera &amp; detector diagnostics
      </summary>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="secondary"
            className="flex-1"
            icon={snapshot.isCameraRunning ? <VideoOff size={18} /> : <Video size={18} />}
            onClick={snapshot.isCameraRunning ? onStopCamera : onStartCamera}
          >
            {snapshot.isCameraRunning ? 'Stop camera' : 'Start camera'}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            icon={<Crosshair size={18} />}
            onClick={onRecalibrate}
            disabled={!snapshot.isCameraRunning}
          >
            Reset centre point
          </Button>
        </div>

        <p role="status" className="m-0 text-[13px] text-muted">
          {snapshot.status}
        </p>

        <StatGrid>
          <StatTile
            label="Lean / step"
            value={lateralText}
            isHighlighted={snapshot.isCalibrated && snapshot.lateralLabel !== LATERAL.CENTER}
            detail={`Offset ${snapshot.lateralOffset.toFixed(2)} sw`}
          />
          <StatTile
            label="Jog in place"
            value={snapshot.isJogging ? 'JOGGING' : 'NO'}
            isHighlighted={snapshot.isJogging}
            detail={`${Math.round(snapshot.cadenceSpm)} spm · ${snapshot.stepCount} steps · Δ ${snapshot.kneeDelta.toFixed(2)}`}
          />
          <StatTile
            label="Frame rate"
            value={snapshot.fps === null ? '--' : snapshot.fps.toFixed(0)}
            detail={
              snapshot.inferenceMs === null
                ? 'Inference -- ms'
                : `Inference ${snapshot.inferenceMs.toFixed(1)} ms`
            }
          />
          <StatTile
            label="Backend"
            value={snapshot.delegate ?? '--'}
            detail={
              snapshot.poseModel
                ? `${snapshot.poseModel} model · ${snapshot.cameraLabel ?? ''}`
                : '--'
            }
          />
        </StatGrid>
      </div>
    </details>
  );
}
