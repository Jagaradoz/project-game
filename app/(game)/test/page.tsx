'use client';
import dynamic from 'next/dynamic';
const TestCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false, loading: () => <main className="p-8">Preparing Test Mode…</main>,
});
export default function TestPage() { return <TestCanvas mode="test" />; }
