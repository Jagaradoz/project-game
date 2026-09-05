'use client';

/**
 * The control group, per TOR 3 (การประเมินแรงจูงใจและการใช้งาน):
 * กลุ่มควบคุมทำกิจกรรมการเคลื่อนไหวรูปแบบเดียวกันผ่านระบบตรวจจับท่าทาง
 * แต่ไม่มีตัวละคร ศัตรู คะแนน หรือองค์ประกอบเกม.
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
    <div ref={containerRef} className="flex flex-col gap-4">
      <canvas ref={gameCanvasRef} hidden aria-hidden />

      <PoseStage
        videoRef={videoRef}
        overlayRef={overlayRef}
        isCameraRunning={snapshot.isCameraRunning}
        idleLabel="กดปุ่ม “เปิดกล้อง” เพื่อเริ่มบันทึกการเคลื่อนไหว"
      />

      {snapshot.error && <Notice tone="error">{snapshot.error}</Notice>}

      <div className="flex flex-wrap gap-2">
        <Button
          className="flex-[1_1_160px]"
          onClick={snapshot.isCameraRunning ? actions.stopCamera : actions.startCamera}
        >
          {snapshot.isCameraRunning ? 'หยุดและปิดกล้อง' : 'เปิดกล้อง'}
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

      <Card title="จำนวนการเคลื่อนไหวที่ตรวจจับได้">
        <StatGrid>
          <StatTile
            label="การเคลื่อนไหวทั้งหมด"
            value={formatNumber(snapshot.movementCount)}
            detail="ก้าวขณะวิ่งอยู่กับที่ + การก้าวซ้าย-ขวา"
          />
          <StatTile label="ก้าววิ่งอยู่กับที่" value={formatNumber(snapshot.stepCount)} />
          <StatTile
            label="เวลาที่เคลื่อนไหว"
            value={formatDuration(snapshot.movementMs)}
            detail={`${movingShare}% ของเวลาทั้งหมด`}
          />
          <StatTile label="เวลาทั้งหมด" value={formatDuration(sessionMs)} />
          <StatTile
            label="จังหวะปัจจุบัน"
            value={snapshot.isJogging ? `${Math.round(snapshot.cadenceSpm)}` : '0'}
            detail="ก้าวต่อนาที"
          />
        </StatGrid>
      </Card>

      <Notice tone="info">
        โหมดนี้ไม่มีตัวละคร ศัตรู คะแนน หรือด่าน เป็นการนับจำนวนการเคลื่อนไหวเพียงอย่างเดียว
        เคลื่อนไหวตามที่สะดวก โดยก้าวซ้าย-ขวาสลับกัน และวิ่งอยู่กับที่เป็นช่วง ๆ
      </Notice>
    </div>
  );
}
