import { LATERAL } from '@/engine/detectors/lateral';
import type { HudSnapshot } from '@/engine/runtime';

interface DetectorDebugPanelProps {
  snapshot: HudSnapshot;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onRecalibrate: () => void;
}

/**
 * The measurement surface for TOR 3.4: detector state, inference latency and
 * frame rate, which is what the technical evaluation is reported from.
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
    <details className="rounded-lg bg-panel px-3 py-2">
      <summary className="cursor-pointer text-[13px] tracking-[0.04em] uppercase text-muted">
        Camera &amp; detector debug
      </summary>

      <div className="mt-2.5 flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <Button onClick={snapshot.isCameraRunning ? onStopCamera : onStartCamera}>
            {snapshot.isCameraRunning ? 'Stop Camera' : 'Start Camera'}
          </Button>
          <Button onClick={onRecalibrate} disabled={!snapshot.isCameraRunning}>
            Recalibrate Center
          </Button>
        </div>

        <p role="status" className="m-0 text-[13px] text-muted">
          {snapshot.status}
        </p>

        <section className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
          <Tile
            label="Lean / Step"
            value={lateralText}
            isActive={snapshot.isCalibrated && snapshot.lateralLabel !== LATERAL.CENTER}
            detail={`offset ${snapshot.lateralOffset.toFixed(2)} sw`}
          />
          <Tile
            label="Jog In Place"
            value={snapshot.isJogging ? 'JOGGING' : 'NO'}
            isActive={snapshot.isJogging}
            detail={`${Math.round(snapshot.cadenceSpm)} spm · ${snapshot.stepCount} steps · Δ ${snapshot.kneeDelta.toFixed(2)}`}
          />
          <Tile
            label="FPS"
            value={snapshot.fps === null ? '--' : snapshot.fps.toFixed(0)}
            detail={
              snapshot.inferenceMs === null
                ? 'inference -- ms'
                : `inference ${snapshot.inferenceMs.toFixed(1)} ms`
            }
          />
          <Tile
            label="Backend"
            value={snapshot.delegate ?? '--'}
            isSmall
            detail={
              snapshot.poseModel
                ? `${snapshot.poseModel} model · ${snapshot.cameraLabel ?? ''}`
                : '--'
            }
          />
        </section>
      </div>
    </details>
  );
}

function Button({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-12 flex-[1_1_160px] cursor-pointer rounded-lg border-0 bg-accent px-4 py-3 font-semibold text-[#04121a] disabled:cursor-not-allowed disabled:bg-off disabled:text-[#aab4bd]"
    >
      {children}
    </button>
  );
}

function Tile({
  label,
  value,
  detail,
  isActive,
  isSmall,
}: {
  label: string;
  value: string;
  detail: string;
  isActive?: boolean;
  isSmall?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-panel px-3 py-2.5">
      <span className="text-[11px] tracking-[0.08em] uppercase text-muted">{label}</span>
      <span
        className={`font-bold tabular-nums leading-[1.1] ${isSmall ? 'text-lg' : 'text-[28px]'} ${
          isActive ? 'text-ok' : ''
        }`}
      >
        {value}
      </span>
      <span className="text-xs tabular-nums text-muted">{detail}</span>
    </div>
  );
}
