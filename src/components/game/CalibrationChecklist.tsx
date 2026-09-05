import type { HudSnapshot } from '@/engine/runtime';
import { classifyDistance, classifyLighting } from '@/engine/util/luma';

export interface CalibrationCheck {
  id: string;
  label: string;
  detail: string;
  isPassing: boolean;
}

/**
 * The gate on TOR 3 (ระบบปรับเทียบกล้อง):
 * ไม่อนุญาตให้เริ่มเกมจนกว่าระบบจะตรวจพบผู้เล่นในตำแหน่งที่เหมาะสม.
 *
 * A pure function of the snapshot plus the rehearsal progress, so the rule that
 * decides whether the run may start is one readable list rather than a
 * condition spread across the page.
 */
export function buildChecks(
  snapshot: HudSnapshot,
  rehearsal: { hasLeaned: boolean; hasJogged: boolean },
): CalibrationCheck[] {
  const lighting = classifyLighting(snapshot.luma);
  const distance = classifyDistance(snapshot.shoulderWidth);

  return [
    {
      id: 'camera',
      label: 'เปิดกล้องแล้ว',
      detail: snapshot.isCameraRunning ? 'กล้องกำลังทำงาน' : 'ยังไม่ได้เปิดกล้อง',
      isPassing: snapshot.isCameraRunning,
    },
    {
      id: 'body',
      label: 'ระบบมองเห็นร่างกาย',
      detail: snapshot.hasBody ? 'ตรวจพบร่างกาย' : 'ยังไม่พบร่างกายในเฟรม',
      isPassing: snapshot.hasBody,
    },
    {
      id: 'knees',
      label: 'เห็นถึงระดับเข่า',
      detail: snapshot.kneesVisible
        ? 'เห็นเข่าทั้งสองข้าง'
        : 'ถอยห่างหรือปรับมุมกล้องให้เห็นเข่า — จำเป็นต่อการตรวจจับการวิ่งอยู่กับที่',
      isPassing: snapshot.kneesVisible,
    },
    {
      id: 'distance',
      label: 'ระยะห่างเหมาะสม',
      detail:
        distance === null
          ? 'รอตรวจจับร่างกาย'
          : distance === 'far'
            ? 'ไกลเกินไป — ขยับเข้าใกล้กล้อง'
            : distance === 'close'
              ? 'ใกล้เกินไป — ถอยห่างจากกล้อง'
              : 'ระยะห่างกำลังดี',
      isPassing: distance === 'ok',
    },
    {
      id: 'lighting',
      label: 'แสงสว่างเพียงพอ',
      detail:
        lighting === null
          ? 'รอตรวจวัดแสง'
          : lighting === 'dark'
            ? 'แสงน้อยเกินไป — เพิ่มแสงด้านหน้า'
            : lighting === 'bright'
              ? 'แสงจ้าเกินไป — ลดแสงย้อนจากด้านหลัง'
              : 'แสงกำลังดี',
      isPassing: lighting === 'ok',
    },
    {
      id: 'calibrated',
      label: 'ตั้งจุดกึ่งกลางแล้ว',
      detail: snapshot.isCalibrated
        ? 'ตั้งจุดกึ่งกลางเรียบร้อย'
        : 'ยืนนิ่งกลางเฟรมสักครู่เพื่อตั้งจุดกึ่งกลาง',
      isPassing: snapshot.isCalibrated,
    },
    {
      id: 'lean',
      label: 'ทดลองก้าวซ้าย-ขวา',
      detail: rehearsal.hasLeaned
        ? 'ตรวจจับการก้าวซ้าย-ขวาได้แล้ว'
        : 'ลองก้าวหรือเอียงตัวไปทางซ้ายและขวา',
      isPassing: rehearsal.hasLeaned,
    },
    {
      id: 'jog',
      label: 'ทดลองวิ่งอยู่กับที่',
      detail: rehearsal.hasJogged
        ? 'ตรวจจับจังหวะการวิ่งอยู่กับที่ได้แล้ว'
        : 'ลองวิ่งอยู่กับที่ ยกเข่าสลับซ้าย-ขวา',
      isPassing: rehearsal.hasJogged,
    },
  ];
}

export function CalibrationChecklist({ checks }: { checks: CalibrationCheck[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {checks.map((check) => (
        <li key={check.id} className="flex items-start gap-2.5 text-sm">
          <span aria-hidden className={check.isPassing ? 'text-ok' : 'text-muted'}>
            {check.isPassing ? '✓' : '○'}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className={check.isPassing ? 'font-semibold text-ok' : 'font-semibold text-text'}>
              {check.label}
              <span className="sr-only">{check.isPassing ? ' — ผ่าน' : ' — ยังไม่ผ่าน'}</span>
            </span>
            <span className="text-xs text-muted">{check.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
