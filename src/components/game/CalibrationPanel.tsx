'use client';

/**
 * TOR 3: ระบบขออนุญาตใช้กล้อง + ระบบปรับเทียบกล้อง.
 *
 * Runs the engine in pose mode -- no WebGL context, no game reducer -- because
 * this screen only needs the detectors. It gates entry to /play: the button
 * stays disabled until every check passes.
 */

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
    <div ref={containerRef} className="flex flex-col gap-4">
      {/* The engine expects a game canvas even in pose mode; in this mode it is
          never drawn to, so it is kept out of the layout and out of the a11y tree. */}
      <canvas ref={gameCanvasRef} hidden aria-hidden />

      <PoseStage
        videoRef={videoRef}
        overlayRef={overlayRef}
        isCameraRunning={snapshot.isCameraRunning}
        idleLabel="กดปุ่ม “เปิดกล้อง” เพื่อเริ่มปรับเทียบ"
      />

      {snapshot.error && (
        <Notice tone="error" title="เข้าถึงกล้องไม่สำเร็จ">
          {snapshot.error}
          <span className="block pt-1">
            หากไม่อนุญาตให้ใช้กล้อง จะไม่สามารถเข้าสู่หน้าเกมได้
            คุณสามารถอนุญาตได้จากแถบที่อยู่ของเบราว์เซอร์แล้วลองอีกครั้ง
          </span>
        </Notice>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          className="flex-[1_1_160px]"
          onClick={snapshot.isCameraRunning ? actions.stopCamera : actions.startCamera}
        >
          {snapshot.isCameraRunning ? 'ปิดกล้อง' : 'เปิดกล้อง'}
        </Button>
        <Button
          variant="secondary"
          className="flex-[1_1_160px]"
          onClick={actions.recalibrate}
          disabled={!snapshot.isCameraRunning}
        >
          ตั้งจุดกึ่งกลางใหม่
        </Button>
      </div>

      <p role="status" className="m-0 text-sm text-muted">
        {snapshot.status}
      </p>

      <Card title="รายการตรวจสอบก่อนเริ่มเล่น">
        <CalibrationChecklist checks={checks} />
      </Card>

      <Card title="ค่าที่ตรวจวัดได้">
        <StatGrid>
          <StatTile
            label="ความสว่าง"
            value={snapshot.luma === null ? '--' : `${Math.round(snapshot.luma * 100)}%`}
            detail="ค่าเฉลี่ยความสว่างของภาพ"
          />
          <StatTile
            label="ระยะห่าง"
            value={
              snapshot.shoulderWidth === null
                ? '--'
                : `${Math.round(snapshot.shoulderWidth * 100)}%`
            }
            detail="ความกว้างไหล่เทียบกับเฟรม"
          />
          <StatTile
            label="ก้าวซ้าย-ขวา"
            value={snapshot.hasBody ? snapshot.lateralLabel : '--'}
            detail={`offset ${snapshot.lateralOffset.toFixed(2)}`}
          />
          <StatTile
            label="วิ่งอยู่กับที่"
            value={snapshot.isJogging ? 'กำลังวิ่ง' : 'หยุด'}
            detail={`${Math.round(snapshot.cadenceSpm)} ก้าว/นาที`}
          />
          <StatTile
            label="FPS"
            value={snapshot.fps === null ? '--' : snapshot.fps.toFixed(0)}
            detail={
              snapshot.inferenceMs === null
                ? 'ความหน่วง -- ms'
                : `ความหน่วง ${snapshot.inferenceMs.toFixed(1)} ms`
            }
          />
        </StatGrid>
      </Card>

      {isReady ? (
        <Notice tone="ok" title="พร้อมเริ่มเล่นแล้ว">
          ระบบตรวจพบคุณในตำแหน่งที่เหมาะสม และตรวจจับการเคลื่อนไหวทั้งสองแบบได้แล้ว
        </Notice>
      ) : (
        <Notice tone="info">
          ทำรายการตรวจสอบด้านบนให้ครบก่อน จึงจะเข้าสู่หน้าเกมได้
        </Notice>
      )}

      <div className="flex flex-wrap gap-2">
        <LinkButton
          href="/stages"
          variant="primary"
          className={`flex-[1_1_180px] ${isReady ? '' : 'pointer-events-none opacity-50'}`}
          aria-disabled={!isReady}
          // A disabled link is still focusable and still activatable by keyboard,
          // so it is removed from the tab order rather than only greyed out.
          tabIndex={isReady ? undefined : -1}
        >
          เลือกด่านและเริ่มเล่น
        </LinkButton>
        <LinkButton href="/how-to-play" className="flex-[1_1_180px]">
          อ่านวิธีเล่นอีกครั้ง
        </LinkButton>
      </div>
    </div>
  );
}
