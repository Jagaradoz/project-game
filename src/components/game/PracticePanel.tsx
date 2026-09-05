'use client';

/**
 * The control group, per TOR 3 (การประเมินแรงจูงใจและการใช้งาน): the control
 * condition performs the same movement activity through the same pose detection
 * with no character, opponent, score or game element.
 *
 * The absence of game elements is the experiment's independent variable, so it
 * is a correctness requirement here, not a styling choice: no character, no
 * enemies, no score, no stage, no progress, no reward language. The engine runs
 * in pose mode, which cannot render a scene even if this file asked it to.
 *
 * The same detectors and the same thresholds as /play, so the movement counts
 * from the two groups are comparable -- which is the whole point of the
 * comparison in Proposal 9.3.
 */

import { Activity, Crosshair, Footprints, Gauge, Timer, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { PoseStage } from '@/components/pose/PoseStage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { useGameRuntime } from '@/hooks/useGameRuntime';
import { formatDuration, formatNumber } from '@/lib/format';

/** The clock only has to look live; it is not a stopwatch anyone races. */
const TICK_MS = 500;

export default function PracticePanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const { actions, snapshot } = useGameRuntime(
    {
      container: containerRef,
      gameCanvas: gameCanvasRef,
      video: videoRef,
      overlay: overlayRef,
    },
    { mode: 'pose' },
  );

  // Session wall-clock, ticking only while the camera is on. The engine's
  // movementMs measures time spent moving; this measures time spent present,
  // and the ratio between them is what the study compares.
  const [sessionMs, setSessionMs] = useState(0);

  useEffect(() => {
    if (!snapshot.isCameraRunning) return;

    // Accumulated from the elapsed delta each tick, via the functional form.
    // Reading sessionMs here instead would capture a stale value, and adding it
    // to the deps would tear the interval down twice a second.
    let lastTickMs = performance.now();
    const timer = setInterval(() => {
      const nowMs = performance.now();
      const deltaMs = nowMs - lastTickMs;
      lastTickMs = nowMs;
      setSessionMs((current) => current + deltaMs);
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [snapshot.isCameraRunning]);

  const movingShare =
    sessionMs > 0 ? Math.min(100, Math.round((snapshot.movementMs / sessionMs) * 100)) : 0;

  return (
    <div ref={containerRef} className="flex flex-col gap-6">
      <canvas ref={gameCanvasRef} hidden aria-hidden />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <PoseStage
            videoRef={videoRef}
            overlayRef={overlayRef}
            isCameraRunning={snapshot.isCameraRunning}
            idleLabel="Press “Start camera” to begin recording your movement"
          />

          {snapshot.error && <Notice tone="error">{snapshot.error}</Notice>}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              className="flex-1"
              icon={snapshot.isCameraRunning ? <VideoOff size={18} /> : <Video size={18} />}
              onClick={snapshot.isCameraRunning ? actions.stopCamera : actions.startCamera}
            >
              {snapshot.isCameraRunning ? 'Stop and close camera' : 'Start camera'}
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              icon={<Crosshair size={18} />}
              onClick={actions.recalibrate}
              disabled={!snapshot.isCameraRunning}
            >
              Reset centre point
            </Button>
          </div>

          <p role="status" className="m-0 text-sm text-muted">
            {snapshot.status}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Movement detected" icon={<Activity size={20} />}>
            <StatGrid>
              <StatTile
                label="Total movements"
                icon={<Activity size={16} />}
                value={formatNumber(snapshot.movementCount)}
                detail="Jog steps plus sideways steps"
              />
              <StatTile
                label="Jog steps"
                icon={<Footprints size={16} />}
                value={formatNumber(snapshot.stepCount)}
              />
              <StatTile
                label="Time moving"
                icon={<Timer size={16} />}
                value={formatDuration(snapshot.movementMs)}
                detail={`${movingShare}% of the session`}
              />
              <StatTile label="Total time" value={formatDuration(sessionMs)} />
              <StatTile
                label="Current cadence"
                icon={<Gauge size={16} />}
                value={snapshot.isJogging ? `${Math.round(snapshot.cadenceSpm)}` : '0'}
                detail="Steps per minute"
              />
            </StatGrid>
          </Card>

          <Notice tone="info">
            There is no character, opponent, score or stage in this mode — it only counts movement.
            Move at whatever pace suits you: step from side to side, and jog in place in bursts.
          </Notice>
        </div>
      </div>
    </div>
  );
}
