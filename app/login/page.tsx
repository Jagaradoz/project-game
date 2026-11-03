import type { Metadata } from 'next';

import { AuthForm } from '@/components/account/AuthForm';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = { title: 'Log in' };

export default function LoginPage() {
  return (
    <PageShell title="Log in" eyebrow="Account" subtitle="Log in to save every run to your stats." width="narrow">
      <AuthForm mode="login" />
    </PageShell>
  );
}
