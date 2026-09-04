import { PageShell, NotBuiltYet } from '@/components/ui/PageShell';

export const metadata = { title: 'ปรับเทียบกล้อง' };

export default function Page() {
  return (
    <PageShell title="ปรับเทียบกล้อง" tor="TOR 3: ระบบขออนุญาตใช้กล้อง + ระบบปรับเทียบกล้อง">
      <NotBuiltYet>Camera permission, body-in-frame check, lighting and distance readout, and a lean/jog rehearsal before the run. The detector state this needs is already exposed by the engine runtime.</NotBuiltYet>
    </PageShell>
  );
}
