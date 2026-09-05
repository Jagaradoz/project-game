'use client';

/**
 * TOR 3 (การจัดการข้อมูลผู้เข้าร่วมทดลอง): ชี้แจงรายละเอียดและขอความยินยอมก่อนเก็บข้อมูล.
 *
 * A client component because consent is a decision made here and stored here.
 * It gates /practice, the control-group mode, and stays revocable -- a
 * participant who withdraws must be able to say so without asking anyone.
 */

import { useState } from 'react';

import { Button, LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { useHydrated } from '@/hooks/useHydrated';
import { formatDateTime } from '@/lib/format';
import { useConsent } from '@/lib/store/consent';

const COLLECTED = [
  'คะแนน จำนวนศัตรูที่กำจัด ระยะเวลาเล่น และระยะทางในเกม',
  'จำนวนการเคลื่อนไหวที่ระบบตรวจจับได้ และระยะเวลาที่เคลื่อนไหวต่อเนื่อง',
  'ด่านและพื้นที่ที่เล่น พร้อมระดับความยากที่เลือก',
  'ข้อมูลเชิงเทคนิคของระบบ เช่น อัตราเฟรมและความหน่วงของการตรวจจับ',
];

const NOT_COLLECTED = [
  'ภาพนิ่งหรือวิดีโอจากกล้อง — ไม่ถูกส่งออกจากเบราว์เซอร์ และไม่ถูกบันทึกไว้ที่ใด',
  'ตำแหน่งข้อต่อร่างกายแบบรายเฟรม — ใช้ประมวลผลในเครื่องแล้วทิ้งทันที',
  'ข้อมูลระบุตัวตนอื่น ๆ นอกเหนือจากที่คุณกรอกเองตอนสมัครสมาชิก',
];

export default function ConsentPage() {
  const acceptedAt = useConsent((state) => state.acceptedAt);
  const accept = useConsent((state) => state.accept);
  const withdraw = useConsent((state) => state.withdraw);

  const [isChecked, setIsChecked] = useState(false);

  // The store is persisted, so its first client render does not match the
  // server's. Wait for its own hydration event rather than a state flip.
  const isReady = useHydrated(useConsent);

  return (
    <PageShell
      title="คำชี้แจงและการขอความยินยอม"
      tor="TOR 3: การจัดการข้อมูลผู้เข้าร่วมทดลอง"
    >
      <Card title="เกี่ยวกับการศึกษานี้">
        <p className="m-0 text-sm leading-relaxed text-muted">
          โครงงานนี้ศึกษาว่าองค์ประกอบของเกม เช่น ระบบศัตรู ระบบคะแนน และระดับความยาก
          ส่งผลต่อแรงจูงใจภายในและความต่อเนื่องในการเคลื่อนไหวของผู้เล่นอย่างไร
          ผู้เข้าร่วมจะถูกแบ่งเป็นสองกลุ่ม กลุ่มหนึ่งเล่นเกมฉบับสมบูรณ์
          อีกกลุ่มทำการเคลื่อนไหวแบบเดียวกันผ่านระบบตรวจจับชุดเดียวกันแต่ไม่มีองค์ประกอบของเกม
          การเข้าร่วมเป็นไปโดยสมัครใจ และคุณสามารถหยุดเมื่อใดก็ได้โดยไม่ต้องให้เหตุผล
        </p>
      </Card>

      <Card title="ข้อมูลที่เก็บ">
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
          {COLLECTED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card title="ข้อมูลที่ไม่เก็บ">
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
          {NOT_COLLECTED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <Notice tone="info" title="การใช้ข้อมูล">
        ผลการทดลองจะถูกวิเคราะห์โดยใช้รหัสผู้เข้าร่วมแทนชื่อ
        และรายงานเป็นภาพรวมทางสถิติเท่านั้น ไม่มีการรายงานผลรายบุคคล
        การเข้าถึงข้อมูลจำกัดเฉพาะผู้จัดทำโครงงานและอาจารย์ที่ปรึกษา
      </Notice>

      {!isReady ? null : acceptedAt ? (
        <>
          <Notice tone="ok" title="คุณได้ให้ความยินยอมแล้ว">
            บันทึกเมื่อ {formatDateTime(acceptedAt)}
          </Notice>

          <div className="flex flex-wrap gap-2">
            <LinkButton href="/practice" variant="primary" className="flex-[1_1_200px]">
              ไปโหมดเคลื่อนไหว (กลุ่มควบคุม)
            </LinkButton>
            <Button variant="secondary" className="flex-[1_1_200px]" onClick={withdraw}>
              ถอนความยินยอม
            </Button>
          </div>
        </>
      ) : (
        <Card>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(event) => setIsChecked(event.target.checked)}
              className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-accent)]"
            />
            <span>
              ข้าพเจ้าได้อ่านและเข้าใจคำชี้แจงข้างต้นแล้ว
              และยินยอมให้เก็บข้อมูลผลการเล่นและข้อมูลการเคลื่อนไหวเพื่อใช้ในการศึกษานี้
            </span>
          </label>

          <Button onClick={accept} disabled={!isChecked} isFullWidth>
            ยินยอมเข้าร่วม
          </Button>

          <p className="m-0 text-xs text-muted">
            หากไม่ยินยอม คุณยังสามารถเล่นเกมได้ตามปกติ เพียงแต่จะไม่เข้าร่วมการเก็บข้อมูลวิจัย
          </p>
        </Card>
      )}
    </PageShell>
  );
}
