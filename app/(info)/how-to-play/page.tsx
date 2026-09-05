import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';

export const metadata = { title: 'วิธีเล่น' };

const CONTROLS = [
  {
    move: 'ก้าวหรือเอียงตัวไปทางซ้าย / ขวา',
    effect: 'ตัวละครเปลี่ยนเลนไปทางนั้นทันที มี 3 เลน คือ ซ้าย กลาง ขวา',
  },
  {
    move: 'วิ่งอยู่กับที่ (ยกเข่าสลับซ้าย-ขวา)',
    effect: 'ตัวละครยิงโจมตีศัตรูอัตโนมัติอย่างต่อเนื่อง',
  },
  {
    move: 'หยุดนิ่ง',
    effect: 'การยิงหยุดทันที แต่ตัวละครยังเดินหน้าต่อ จึงต้องเคลื่อนไหวตลอดเวลา',
  },
];

const SETUP = [
  'ยืนห่างจากกล้องประมาณ 1.5–2 เมตร ให้เห็นร่างกายตั้งแต่ศีรษะถึงเข่า',
  'เว้นพื้นที่ว่างรอบตัวอย่างน้อย 1 ช่วงแขน เพื่อก้าวซ้าย-ขวาได้อย่างปลอดภัย',
  'จัดให้มีแสงสว่างเพียงพอ ส่องมาทางด้านหน้า และหลีกเลี่ยงแสงย้อนจากหน้าต่างด้านหลัง',
  'สวมเสื้อผ้าที่เห็นรูปร่างชัดเจน หลีกเลี่ยงเสื้อผ้าสีกลืนกับฉากหลัง',
  'เก็บของที่อาจสะดุดออกจากพื้นที่เล่น และเล่นบนพื้นที่ไม่ลื่น',
];

export default function HowToPlayPage() {
  return (
    <PageShell
      title="วิธีเล่น"
      tor="TOR 3: หน้าแรกและคำแนะนำการใช้งาน — รายละเอียดเกม วิธีการเล่น และข้อควรระวัง"
    >
      <p className="m-0 text-sm leading-relaxed text-muted">
        เกมนี้ใช้การเคลื่อนไหวร่างกายของคุณเป็นตัวควบคุมโดยตรง ไม่มีการควบคุมด้วยเมาส์
        และไม่จำเป็นต้องใช้อุปกรณ์เสริมใด ๆ นอกจากกล้องเว็บแคม
      </p>

      <Card title="การควบคุม">
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {CONTROLS.map((control) => (
            <li key={control.move} className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-accent">{control.move}</span>
              <span className="text-sm text-muted">{control.effect}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="จัดพื้นที่ก่อนเริ่มเล่น">
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
          {SETUP.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card title="ด่านและความก้าวหน้า" note="TOR 3: ระบบ Biome และ Stage">
        <p className="m-0 text-sm text-muted">
          เกมแบ่งออกเป็นหลายพื้นที่ (Biome) แต่ละพื้นที่มี 10 ด่าน (Stage)
          แต่ละด่านมีเป้าหมายเป็นจำนวนศัตรูที่ต้องกำจัด เมื่อผ่านด่านหนึ่งจะปลดล็อกด่านถัดไป
          และเมื่อผ่านครบทั้ง 10 ด่านจะปลดล็อกพื้นที่ถัดไป
          คุณสามารถเลือกระดับความยากเริ่มต้นได้เองตามความสามารถ
        </p>
      </Card>

      <Notice tone="warn" title="ข้อควรระวังด้านความปลอดภัย">
        หากรู้สึกเวียนศีรษะ เจ็บหน้าอก หายใจไม่ทัน หรือเหนื่อยผิดปกติ ให้หยุดเล่นทันที
        ระบบนี้ไม่ใช่อุปกรณ์ทางการแพทย์และไม่ใช้สำหรับวินิจฉัยโรค
        จำนวนการเคลื่อนไหวที่แสดงเป็นค่าที่ระบบตรวจวัดได้ ไม่ใช่ค่าพลังงานที่ได้รับการรับรองทางการแพทย์
        ผู้ที่มีโรคประจำตัวควรปรึกษาแพทย์ก่อนออกกำลังกาย
      </Notice>

      <Notice tone="ok" title="ความเป็นส่วนตัว">
        การประมวลผลภาพและการตรวจจับท่าทางทั้งหมดทำงานบนเบราว์เซอร์ของคุณ
        ภาพและวิดีโอจากกล้องจะไม่ถูกส่งไปยังเซิร์ฟเวอร์และไม่ถูกบันทึกไว้ที่ใด
      </Notice>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/calibrate" variant="primary" className="flex-[1_1_180px]">
          ไปหน้าปรับเทียบกล้อง
        </LinkButton>
        <LinkButton href="/stages" className="flex-[1_1_180px]">
          เลือกด่าน
        </LinkButton>
      </div>
    </PageShell>
  );
}
