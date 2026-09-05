'use client';

/**
 * TOR 3: ระบบขออนุญาตใช้กล้อง + ระบบปรับเทียบกล้อง.
 *
 * getUserMedia and the MediaPipe WASM bundle exist only in the browser, so the
 * panel is a client-only dynamic import for the same reason /play is. In the App
 * Router `ssr: false` is legal only inside a Client Component, which is why the
 * directive is here.
 */

import dynamic from 'next/dynamic';

import { PageShell } from '@/components/ui/PageShell';

const CalibrationPanel = dynamic(() => import('@/components/game/CalibrationPanel'), {
  ssr: false,
  loading: () => <p className="m-0 text-sm text-muted">กำลังเตรียมระบบตรวจจับ...</p>,
});

export default function CalibratePage() {
  return (
    <PageShell
      title="ปรับเทียบกล้อง"
      tor="TOR 3: ระบบขออนุญาตใช้กล้อง + ระบบปรับเทียบกล้อง"
    >
      <p className="m-0 text-sm leading-relaxed text-muted">
        ขั้นตอนนี้ตรวจสอบว่ากล้องมองเห็นคุณชัดเจนพอสำหรับควบคุมเกม
        ภาพจากกล้องถูกประมวลผลบนเครื่องของคุณเท่านั้น และไม่ถูกส่งไปที่ใด
      </p>

      <CalibrationPanel />
    </PageShell>
  );
}
