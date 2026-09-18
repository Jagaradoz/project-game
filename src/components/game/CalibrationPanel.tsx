'use client';

/**
 * TOR 3: ระบบขออนุญาตใช้กล้อง + ระบบปรับเทียบกล้อง.
 *
 * Runs the engine in pose mode -- no WebGL context, no game reducer -- because
 * this screen only needs the detectors. It gates entry to /play: the button
 * stays disabled until every check passes.
 */

import {
  BookOpen,
  Crosshair,
  Gauge,
  ListChecks,
  Map,
  MoveHorizontal,
  Ruler,
  Sun,
  Video,
  VideoOff,
} from 'lucide-react';
import { useMemo, useRef } from 'react';

import { PoseStage } from '@/components/pose/PoseStage';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { useGameRuntime } from '@/hooks/useGameRuntime';
import { CalibrationChecklist, buildChecks } from '@/components/game/CalibrationChecklist';

export default function CalibrationPanel() {
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

  /**
   * The rehearsal is a latch: having leaned once is the thing being checked, and
   * it must not un-tick when the player returns to centre. Both counters in the
   * snapshot only ever increase, so the latch is a comparison rather than state
   * of its own -- no effect, and nothing to get out of sync with the engine.
   */
  const hasLeaned = snapshot.lateralChangeCount > 0;
  const hasJogged = snapshot.stepCount > 0;

  const checks = useMemo(
    () => buildChecks(snapshot, { hasLeaned, hasJogged }),
    [snapshot, hasLeaned, hasJogged],
  );
  const isReady = checks.every((check) => check.isPassing);

  return (
    <div ref={containerRef} className="flex flex-col gap-6">
      {/* The engine expects a game canvas even in pose mode; in this mode it is
          never drawn to, so it is kept out of the layout and out of the a11y tree. */}
      <canvas ref={gameCanvasRef} hidden aria-hidden />

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="flex flex-col gap-4 lg:col-span-7">
          <PoseStage
            videoRef={videoRef}
            overlayRef={overlayRef}
            isCameraRunning={snapshot.isCameraRunning}
            idleLabel="Press “Start camera” to begin calibration"
          />

          {snapshot.error && (
            <Notice tone="error" title="Could not access the camera">
              {snapshot.error}
              <span className="block pt-1">
                Without camera permission you cannot enter the game. You can grant it from your
                browser&rsquo;s address bar and try again.
              </span>
            </Notice>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              className="flex-1"
              icon={snapshot.isCameraRunning ? <VideoOff size={18} /> : <Video size={18} />}
              onClick={snapshot.isCameraRunning ? actions.stopCamera : actions.startCamera}
            >
              {snapshot.isCameraRunning ? 'Stop camera' : 'Start camera'}
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

        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card title="Pre-flight checklist" icon={<ListChecks size={20} />}>
            <CalibrationChecklist checks={checks} />
          </Card>

          {isReady ? (
            <Notice tone="ok" title="You are ready to play">
              The system can see you clearly and has detected both kinds of movement.
            </Notice>
          ) : (
            <Notice tone="info">
              Complete every item above to unlock the game.
            </Notice>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <LinkButton
              href="/stages"
              variant="primary"
              icon={<Map size={18} />}
              className={`flex-1 ${isReady ? '' : 'pointer-events-none opacity-50'}`}
              aria-disabled={!isReady}
              // A disabled link is still focusable and still activatable by keyboard,
              // so it is removed from the tab order rather than only greyed out.
              tabIndex={isReady ? undefined : -1}
            >
              Choose a stage
            </LinkButton>
            <LinkButton href="/how-to-play" icon={<BookOpen size={18} />} className="flex-1">
              Read the guide
            </LinkButton>
          </div>
        </div>
      </div>

      <Card title="Live measurements" icon={<Gauge size={20} />}>
        <StatGrid>
          <StatTile
            label="Brightness"
            icon={<Sun size={16} />}
            value={snapshot.luma === null ? '--' : `${Math.round(snapshot.luma * 100)}%`}
            detail="Average image brightness"
          />
          <StatTile
            label="Distance"
            icon={<Ruler size={16} />}
            value={
              snapshot.shoulderWidth === null
                ? '--'
                : `${Math.round(snapshot.shoulderWidth * 100)}%`
            }
            detail="Shoulder width relative to the frame"
          />
          <StatTile
            label="Sideways step"
            icon={<MoveHorizontal size={16} />}
            value={snapshot.hasBody ? snapshot.lateralLabel : '--'}
            detail={`Offset ${snapshot.lateralOffset.toFixed(2)}`}
          />
          <StatTile
            label="Jog in place"
            icon={<Gauge size={16} />}
            value={snapshot.isJogging ? 'Jogging' : 'Idle'}
            detail={`${Math.round(snapshot.cadenceSpm)} steps/min`}
          />
          <StatTile
            label="Frame rate"
            value={snapshot.fps === null ? '--' : snapshot.fps.toFixed(0)}
            detail={
              snapshot.inferenceMs === null
                ? 'Latency -- ms'
                : `Latency ${snapshot.inferenceMs.toFixed(1)} ms`
            }
          />
        </StatGrid>
      </Card>
    </div>
  );
}
