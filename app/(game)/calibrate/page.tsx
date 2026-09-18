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
import { LoaderCircle } from 'lucide-react';

import { PageShell } from '@/components/ui/PageShell';

const CalibrationPanel = dynamic(() => import('@/components/game/CalibrationPanel'), {
  ssr: false,
  loading: () => (
    <p className="m-0 flex items-center gap-2 text-sm text-muted">
      <LoaderCircle aria-hidden size={16} className="animate-spin" />
      Preparing the detection system…
    </p>
  ),
});

export default function CalibratePage() {
  return (
    <PageShell
      eyebrow="Studio"
      title="Camera Setup"
      subtitle="A one-minute check that the camera can see you clearly enough to control the game. Everything is processed on your device."
      width="wide"
    >
      <CalibrationPanel />
    </PageShell>
  );
}
