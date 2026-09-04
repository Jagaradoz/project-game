import { PageShell, NotBuiltYet } from '@/components/ui/PageShell';

export const metadata = { title: 'สมัครสมาชิก' };

export default function Page() {
  return (
    <PageShell title="สมัครสมาชิก" tor="TOR 3: ระบบสมาชิกและเข้าสู่ระบบ">
      <NotBuiltYet>Registration with email-format and duplicate-email validation. The email is fixed at registration and not editable afterwards.</NotBuiltYet>
    </PageShell>
  );
}
