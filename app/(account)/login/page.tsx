import { PageShell, NotBuiltYet } from '@/components/ui/PageShell';

export const metadata = { title: 'เข้าสู่ระบบ' };

export default function Page() {
  return (
    <PageShell title="เข้าสู่ระบบ" tor="TOR 3: ระบบสมาชิกและเข้าสู่ระบบ">
      <NotBuiltYet>Email and password sign-in. The session cookie is issued by the backend; this app never stores credentials.</NotBuiltYet>
    </PageShell>
  );
}
