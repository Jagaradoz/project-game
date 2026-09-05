'use client';

/* TOR 3: ระบบสมาชิกและเข้าสู่ระบบ. */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, User, UserPlus } from 'lucide-react';
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
    <PageShell
      title="Create an Account"
      subtitle="An account keeps your progress and puts your display name on the leaderboard."
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
            hint="You will sign in with this address, and it cannot be changed later."
          />

          <Field
            label="Display name"
            autoComplete="nickname"
            icon={<User size={18} />}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            error={errors.displayName}
            hint="This is what appears on the leaderboard instead of your email."
          />

          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            icon={<Lock size={18} />}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            hint={`At least ${PASSWORD_MIN} characters.`}
          />

          {formError && <Notice tone="error">{formError}</Notice>}

          <Button type="submit" isLoading={isSubmitting} icon={<UserPlus size={18} />} isFullWidth>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Card>

      <p className="m-0 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-primary">
          Sign in
        </Link>
      </p>
    </PageShell>
  );
}
