'use client';

/* TOR 3: ระบบสมาชิกและเข้าสู่ระบบ. */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogIn, Lock, Mail } from 'lucide-react';
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
    <PageShell
      eyebrow="Account"
      title="Sign In"
      subtitle="Sign in to keep your statistics across sessions."
      width="narrow"
    >
      <LocalAccountNotice />

      <Card>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            icon={<Mail size={18} />}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
          />

          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            icon={<Lock size={18} />}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
          />

          {formError && <Notice tone="error">{formError}</Notice>}

          <Button type="submit" isLoading={isSubmitting} icon={<LogIn size={18} />} isFullWidth>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>

      <p className="m-0 text-center text-sm text-muted">
        Don&rsquo;t have an account?{' '}
        <Link href="/register" className="font-semibold text-primary">
          Create one
        </Link>
      </p>

      <p className="m-0 text-center text-xs text-subtle">
        You can play without signing in — your statistics are kept on this device.
      </p>
    </PageShell>
  );
}
