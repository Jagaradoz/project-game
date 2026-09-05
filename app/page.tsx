import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';

const CAUTIONS = [
  'เว้นพื้นที่ว่างประมาณ 1.5–2 เมตร สำหรับการขยับตัว',
  'ตั้งกล้องให้เห็นร่างกายตั้งแต่ศีรษะถึงเข่า',
  'ให้มีแสงสว่างเพียงพอ และหลีกเลี่ยงแสงย้อนจากด้านหลัง',
  'หากรู้สึกเวียนศีรษะหรือเหนื่อยผิดปกติ ให้หยุดเล่นทันที',
  'ระบบนี้ไม่ใช่อุปกรณ์ทางการแพทย์ และไม่ใช้สำหรับวินิจฉัยโรค',
];

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

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/calibrate" variant="primary" className="flex-[1_1_160px]">
          ปรับเทียบกล้อง
        </LinkButton>
        <LinkButton href="/stages" className="flex-[1_1_160px]">
          เลือกด่าน
        </LinkButton>
        <LinkButton href="/play" className="flex-[1_1_160px]">
          เริ่มเล่นเลย
        </LinkButton>
      </div>

      <Card title="ข้อควรระวังก่อนเริ่มเล่น">
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
          {CAUTIONS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <LinkButton href="/how-to-play" variant="ghost" className="self-start px-0">
          อ่านวิธีเล่นแบบละเอียด →
        </LinkButton>
      </Card>

      <Notice tone="ok" title="ความเป็นส่วนตัว">
        การประมวลผลภาพและตรวจจับท่าทางทั้งหมดทำงานบนเบราว์เซอร์ของคุณ
        ภาพและวิดีโอจากกล้องจะไม่ถูกส่งไปยังเซิร์ฟเวอร์และไม่ถูกบันทึกลงฐานข้อมูล
      </Notice>

      <Card title="เข้าร่วมการศึกษา" note="TOR 3: การจัดการข้อมูลผู้เข้าร่วมทดลอง">
        <p className="m-0 text-sm text-muted">
          โครงงานนี้ศึกษาผลขององค์ประกอบเกมต่อแรงจูงใจในการเคลื่อนไหว
          หากคุณเป็นผู้เข้าร่วมกลุ่มควบคุม กรุณาอ่านคำชี้แจงและให้ความยินยอมก่อนเริ่ม
        </p>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/consent" className="flex-[1_1_180px]">
            คำชี้แจงและความยินยอม
          </LinkButton>
          <LinkButton href="/practice" className="flex-[1_1_180px]">
            โหมดเคลื่อนไหว (กลุ่มควบคุม)
          </LinkButton>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/login" variant="ghost" className="flex-[1_1_140px]">
          เข้าสู่ระบบ
        </LinkButton>
        <LinkButton href="/register" variant="ghost" className="flex-[1_1_140px]">
          สมัครสมาชิก
        </LinkButton>
      </div>
    </PageShell>
  );
}
