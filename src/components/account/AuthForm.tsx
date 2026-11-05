'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogIn, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { loginAccount, registerAccount, safeNextPath } from '@/lib/api/account';
import { useAccount } from '@/lib/store/account';
import { ACCOUNT_RULES, credentialsSchema, firstIssue, loginSchema } from '@/lib/validation/account';

type Mode = 'login' | 'register';

const COPY = {
  login: { title: 'Welcome back', submit: 'Log in', switchText: 'No account yet?', switchLabel: 'Register', switchHref: '/register' },
  register: { title: 'Create your account', submit: 'Register', switchText: 'Already have an account?', switchLabel: 'Log in', switchHref: '/login' },
} as const;

/** Where to go after success: the `?next=` path, same-origin only. */
function nextPath(): string {
  return safeNextPath(new URLSearchParams(window.location.search).get('next'));
}

function validate(mode: Mode, username: string, password: string, confirm: string): string | null {
  const parsed = (mode === 'register' ? credentialsSchema : loginSchema).safeParse({ username, password });
  if (!parsed.success) return firstIssue(parsed.error);
  if (mode === 'register' && password !== confirm) return 'Passwords do not match.';
  return null;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const status = useAccount((s) => s.status);
  const setUser = useAccount((s) => s.setUser);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = COPY[mode];

  // Already logged in: this page has nothing to offer.
  useEffect(() => {
    if (status === 'user') router.replace(nextPath());
  }, [status, router]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = validate(mode, username, password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const send = mode === 'register' ? registerAccount : loginAccount;
    const result = await send(username.trim(), password);
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUser(result.data.username);
    router.replace(nextPath());
  };

  return (
    <Card title={copy.title} icon={mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />} tone="primary">
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Field label="Username" name="username" autoComplete="username" value={username}
          onChange={(event) => setUsername(event.target.value)}
          hint={mode === 'register' ? '3-20 letters, digits or underscores' : undefined} />
        <Field label="Password" name="password" type="password" value={password}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          onChange={(event) => setPassword(event.target.value)}
          hint={mode === 'register' ? `At least ${ACCOUNT_RULES.passwordMinLength} characters` : undefined} />
        {mode === 'register' && (
          <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password"
            value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="primary" isFullWidth isLoading={isSubmitting}>{copy.submit}</Button>
        <p className="m-0 text-center text-sm text-muted">
          {copy.switchText}{' '}
          <Link href={copy.switchHref} className="font-bold text-ink underline decoration-primary decoration-2 underline-offset-4">
            {copy.switchLabel}
          </Link>
        </p>
      </form>
    </Card>
  );
}
