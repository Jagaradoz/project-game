import Link from 'next/link';

import { PageShell } from '@/components/ui/PageShell';

export default function HomePage() {
  return (
    <PageShell
      title="Trail Runner"
      tor="TOR 3: หน้าแรกและคำแนะนำการใช้งาน — เว็บไซต์เกมออกกำลังกายผ่านเว็บแคม"
    >
      <p className="m-0 text-sm leading-relaxed">
        ควบคุมเกมด้วยการเคลื่อนไหวร่างกายผ่านกล้องเว็บแคม เอียงหรือก้าวไปทางซ้าย-ขวาเพื่อเปลี่ยนเลน
        และวิ่งอยู่กับที่เพื่อให้ตัวละครโจมตี หากหยุดเคลื่อนไหว การโจมตีจะหยุดทันที
      </p>

      <section className="rounded-lg bg-panel p-4 text-sm text-muted">
        <h2 className="m-0 mb-2 text-base font-semibold text-text">ข้อควรระวังก่อนเริ่มเล่น</h2>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
          <li>เว้นพื้นที่ว่างประมาณ 1.5–2 เมตร สำหรับการขยับตัว</li>
          <li>ตั้งกล้องให้เห็นร่างกายตั้งแต่ศีรษะถึงเข่า</li>
          <li>ให้มีแสงสว่างเพียงพอ และหลีกเลี่ยงแสงย้อนจากด้านหลัง</li>
          <li>ระบบนี้ไม่ใช่อุปกรณ์ทางการแพทย์ และไม่ใช้สำหรับวินิจฉัยโรค</li>
        </ul>
      </section>

      <section className="rounded-lg border border-line p-4 text-sm text-muted">
        <h2 className="m-0 mb-2 text-base font-semibold text-text">ความเป็นส่วนตัว</h2>
        <p className="m-0">
          การประมวลผลภาพและตรวจจับท่าทางทั้งหมดทำงานบนเบราว์เซอร์ของคุณ
          ภาพและวิดีโอจากกล้องจะไม่ถูกส่งไปยังเซิร์ฟเวอร์และไม่ถูกบันทึกลงฐานข้อมูล
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/calibrate"
          className="min-h-12 flex-[1_1_160px] content-center rounded-lg bg-accent px-4 py-3 text-center font-semibold text-[#04121a]"
        >
          ปรับเทียบกล้อง
        </Link>
        <Link
          href="/play"
          className="min-h-12 flex-[1_1_160px] content-center rounded-lg border border-line px-4 py-3 text-center font-semibold"
        >
          เริ่มเล่นเลย
        </Link>
      </div>
    </PageShell>
  );
}
