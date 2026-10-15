'use client';
import dynamic from 'next/dynamic';
const CalibrationCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false, loading: () => <main className="p-8">Preparing calibration…</main>,
});
export default function CalibratePage() { return <CalibrationCanvas mode="pose" />; }
