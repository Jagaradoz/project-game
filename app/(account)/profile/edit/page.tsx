'use client';

/* TOR 3: ระบบสมาชิกและเข้าสู่ระบบ -- editing the account's display name. */

import { useRouter } from 'next/navigation';
import { ArrowLeft, LogIn, Mail, Save, User, UserPlus } from 'lucide-react';
import { useState } from 'react';

import { LocalAccountNotice } from '@/components/account/LocalAccountNotice';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { useSession } from '@/hooks/useSession';
import { getErrorMessage, repository } from '@/lib/api';
import { fieldErrors, profileEditSchema } from '@/lib/validation/account';

const SUBTITLE = 'Change the name other players see on the leaderboard.';

export default function ProfileEditPage() {
  const router = useRouter();
  const { session, isLoading, refresh } = useSession();

  /**
   * The field is the player's edit when they have made one, and the stored name
   * otherwise. Derived rather than seeded by an effect: seeding would need the
   * session to arrive first, and typing before it did would be overwritten.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const displayName = draft ?? session?.user.displayName ?? '';

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setIsSaved(false);

    const parsed = profileEditSchema.safeParse({ displayName });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await repository.updateDisplayName(parsed.data.displayName);
      await refresh();
      // Drop the draft so the field falls back to the refreshed session value,
      // which is the trimmed name the repository actually stored.
      setDraft(null);
      setIsSaved(true);
    } catch (error: unknown) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <PageShell eyebrow="Account" title="Edit Profile" subtitle={SUBTITLE} width="narrow">
        <p className="m-0 text-sm text-muted">Loading…</p>
      </PageShell>
    );
  }

  if (!session) {
    return (
      <PageShell eyebrow="Account" title="Edit Profile" subtitle={SUBTITLE} width="narrow">
        <Notice tone="info" title="Sign in first">
          This page edits your account details. Please sign in or create an account to continue.
        </Notice>
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton
            href="/login"
            variant="primary"
            icon={<LogIn size={18} />}
            className="flex-1"
          >
            Sign in
          </LinkButton>
          <LinkButton href="/register" icon={<UserPlus size={18} />} className="flex-1">
            Create an account
          </LinkButton>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Account" title="Edit Profile" subtitle={SUBTITLE} width="narrow">
      <>
        <LocalAccountNotice />

        <Card>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <Field
              label="Email"
              type="email"
              icon={<Mail size={18} />}
              value={session.user.email}
              readOnly
              disabled
              // TOR 3 is explicit: the email used to register cannot be changed.
              // The field is shown rather than hidden so the player can see
              // which account they are editing.
              hint="Your email is set when you register and cannot be changed."
            />

            <Field
              label="Display name"
              autoComplete="nickname"
              icon={<User size={18} />}
              value={displayName}
              onChange={(event) => setDraft(event.target.value)}
              error={errors.displayName}
              hint="This is what appears on the leaderboard instead of your email."
            />

            {formError && <Notice tone="error">{formError}</Notice>}
            {isSaved && <Notice tone="ok">Your changes have been saved.</Notice>}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="submit"
                isLoading={isSubmitting}
                icon={<Save size={18} />}
                className="flex-1"
              >
                {isSubmitting ? 'Saving…' : 'Save changes'}
              </Button>
              <Button
                variant="secondary"
                icon={<ArrowLeft size={18} />}
                className="flex-1"
                onClick={() => router.push('/profile')}
              >
                Back to profile
              </Button>
            </div>
          </form>
        </Card>
      </>
    </PageShell>
  );
}
