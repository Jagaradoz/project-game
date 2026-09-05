import { Notice } from '@/components/ui/Notice';
import { IS_MOCK_MODE } from '@/lib/api';

/**
 * Says plainly that the account is local.
 *
 * A login form that looks real but is not is worse than no login form: a player
 * could reasonably reuse a real password in it. TOR 5 gives auth to the backend,
 * so until that exists this notice appears on every account screen.
 *
 * It renders nothing in live mode, so it disappears on its own.
 */
export function LocalAccountNotice() {
  if (!IS_MOCK_MODE) return null;

  return (
    <Notice tone="warn" title="บัญชีนี้เก็บอยู่ในเบราว์เซอร์นี้เท่านั้น">
      ระบบสมาชิกจริงจะมาพร้อมกับส่วน Backend ขณะนี้บัญชีและสถิติถูกเก็บไว้ในเครื่องของคุณ
      ไม่ได้ส่งไปที่เซิร์ฟเวอร์ และจะหายไปหากล้างข้อมูลเบราว์เซอร์
      <strong className="block pt-1">กรุณาอย่าใช้รหัสผ่านจริงที่คุณใช้กับบริการอื่น</strong>
    </Notice>
  );
}
