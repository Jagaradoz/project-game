import type { Metadata } from 'next';

import { AuthForm } from '@/components/account/AuthForm';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = { title: 'Register' };

export default function RegisterPage() {
  return (
    <PageShell title="Register" eyebrow="Account" subtitle="A username and password is all it takes. No email needed." width="narrow">
      <AuthForm mode="register" />
    </PageShell>
  );
}
