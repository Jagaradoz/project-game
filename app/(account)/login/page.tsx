'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';

import { LocalAccountNotice } from '@/components/account/LocalAccountNotice';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { getErrorMessage, repository } from '@/lib/api';
import { fieldErrors, loginSchema } from '@/lib/validation/account';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    // Validated here as well as in the repository: the same schema, so the two
    // can never disagree, and the player gets the message without a round trip.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await repository.login(parsed.data);
      router.push('/profile');
    } catch (error: unknown) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell title="เข้าสู่ระบบ" tor="TOR 3: ระบบสมาชิกและเข้าสู่ระบบ">
      <LocalAccountNotice />

      <Card>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field
            label="อีเมล"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
          />

          <Field
            label="รหัสผ่าน"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
          />

          {formError && <Notice tone="error">{formError}</Notice>}

          <Button type="submit" disabled={isSubmitting} isFullWidth>
            {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </Button>
        </form>
      </Card>

      <p className="m-0 text-center text-sm text-muted">
        ยังไม่มีบัญชี?{' '}
        <Link href="/register" className="font-semibold text-accent">
          สมัครสมาชิก
        </Link>
      </p>

      <p className="m-0 text-center text-xs text-muted">
        คุณสามารถเล่นเกมได้โดยไม่ต้องเข้าสู่ระบบ สถิติจะถูกเก็บไว้ในเครื่องนี้
      </p>
    </PageShell>
  );
}
