'use client';

/* TOR 3: ระบบสมาชิกและเข้าสู่ระบบ -- editing the account's display name and avatar. */

import { useRouter } from 'next/navigation';
import { ArrowLeft, LogIn, Mail, Save, Shuffle, User, UserPlus } from 'lucide-react';
import { useState } from 'react';

import { LocalAccountNotice } from '@/components/account/LocalAccountNotice';
import { PlayerAvatar } from '@/components/account/PlayerAvatar';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { useSession } from '@/hooks/useSession';
import { getErrorMessage, repository } from '@/lib/api';
import { avatarCandidates, avatarSeedFor } from '@/lib/avatar';
import { fieldErrors, profileEditSchema } from '@/lib/validation/account';

const SUBTITLE = 'Change the name and avatar other players see.';

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

  const storedSeed = session ? avatarSeedFor(session.user) : '';
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  const avatarSeed = avatarDraft ?? storedSeed;
  const [candidates, setCandidates] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (storedSeed && candidates.length === 0) {
    setCandidates(avatarCandidates(storedSeed));
  }

  function shuffleCandidates() {
    setCandidates(avatarCandidates(avatarSeed));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setIsSaved(false);

    const parsed = profileEditSchema.safeParse({ displayName, avatarSeed });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await repository.updateProfile(parsed.data);
      await refresh();
      // Drop the drafts so the fields fall back to the refreshed session values.
      setDraft(null);
      setAvatarDraft(null);
      setCandidates(avatarCandidates(parsed.data.avatarSeed));
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

            <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
              <legend className="mb-0 text-sm font-semibold text-text">Avatar</legend>
              <p className="m-0 text-xs text-muted">
                Pick a Critter, or shuffle for a new set. Saved with your profile — not a photo.
              </p>

              <div className="grid grid-cols-4 gap-2">
                {candidates.map((seed) => {
                  const isSelected = seed === avatarSeed;
                  return (
                    <button
                      key={seed}
                      type="button"
                      onClick={() => setAvatarDraft(seed)}
                      aria-pressed={isSelected}
                      aria-label={isSelected ? 'Selected avatar' : 'Select this avatar'}
                      className={`cursor-pointer rounded-full p-0.5 transition-shadow ${
                        isSelected
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface'
                          : 'hover:ring-2 hover:ring-line-strong hover:ring-offset-2 hover:ring-offset-surface'
                      }`}
                    >
                      <PlayerAvatar seed={seed} name={displayName || 'Player'} size="md" decorative />
                    </button>
                  );
                })}
              </div>

              {errors.avatarSeed && (
                <p className="m-0 text-sm text-danger-text">{errors.avatarSeed}</p>
              )}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Shuffle size={16} />}
                onClick={shuffleCandidates}
                className="self-start"
              >
                Shuffle
              </Button>
            </fieldset>

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
