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
import { PASSWORD_MIN, fieldErrors, registerSchema } from '@/lib/validation/account';

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = registerSchema.safeParse({ email, password, displayName });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      // The duplicate-email check lives in the repository, not here: only it
      // can see the whole account list.
      await repository.register(parsed.data);
      router.push('/profile');
    } catch (error: unknown) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell title="สมัครสมาชิก" tor="TOR 3: ระบบสมาชิกและเข้าสู่ระบบ">
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
            hint="ใช้อีเมลนี้เข้าสู่ระบบ และจะไม่สามารถแก้ไขได้ภายหลัง"
          />

          <Field
            label="ชื่อในเกม"
            autoComplete="nickname"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            error={errors.displayName}
            hint="ชื่อนี้จะแสดงในตารางคะแนนแทนอีเมลของคุณ"
          />

          <Field
            label="รหัสผ่าน"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            hint={`อย่างน้อย ${PASSWORD_MIN} ตัวอักษร`}
          />

          {formError && <Notice tone="error">{formError}</Notice>}

          <Button type="submit" disabled={isSubmitting} isFullWidth>
            {isSubmitting ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
          </Button>
        </form>
      </Card>

      <p className="m-0 text-center text-sm text-muted">
        มีบัญชีอยู่แล้ว?{' '}
        <Link href="/login" className="font-semibold text-accent">
          เข้าสู่ระบบ
        </Link>
      </p>
    </PageShell>
  );
}
