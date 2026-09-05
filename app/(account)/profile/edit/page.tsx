'use client';

import { useRouter } from 'next/navigation';
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
      <PageShell title="แก้ไขข้อมูลส่วนตัว" tor="TOR 3: ระบบสมาชิกและเข้าสู่ระบบ">
        <p className="m-0 text-sm text-muted">กำลังโหลด...</p>
      </PageShell>
    );
  }

  if (!session) {
    return (
      <PageShell title="แก้ไขข้อมูลส่วนตัว" tor="TOR 3: ระบบสมาชิกและเข้าสู่ระบบ">
        <Notice tone="info" title="ต้องเข้าสู่ระบบก่อน">
          หน้านี้ใช้แก้ไขข้อมูลบัญชีของคุณ กรุณาเข้าสู่ระบบหรือสมัครสมาชิกก่อน
        </Notice>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/login" variant="primary" className="flex-[1_1_160px]">
            เข้าสู่ระบบ
          </LinkButton>
          <LinkButton href="/register" className="flex-[1_1_160px]">
            สมัครสมาชิก
          </LinkButton>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="แก้ไขข้อมูลส่วนตัว" tor="TOR 3: ระบบสมาชิกและเข้าสู่ระบบ">
      <LocalAccountNotice />

      <Card>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field
            label="อีเมล"
            type="email"
            value={session.user.email}
            readOnly
            disabled
            // TOR 3 is explicit: ไม่สามารถแก้ไขอีเมลที่ใช้สมัครสมาชิกได้. The
            // field is shown rather than hidden so the player can see which
            // account they are editing.
            hint="อีเมลถูกกำหนดตอนสมัครสมาชิกและไม่สามารถแก้ไขได้"
          />

          <Field
            label="ชื่อในเกม"
            autoComplete="nickname"
            value={displayName}
            onChange={(event) => setDraft(event.target.value)}
            error={errors.displayName}
            hint="ชื่อนี้จะแสดงในตารางคะแนนแทนอีเมลของคุณ"
          />

          {formError && <Notice tone="error">{formError}</Notice>}
          {isSaved && <Notice tone="ok">บันทึกข้อมูลเรียบร้อยแล้ว</Notice>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isSubmitting} className="flex-[1_1_160px]">
              {isSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
            <Button
              variant="secondary"
              className="flex-[1_1_160px]"
              onClick={() => router.push('/profile')}
            >
              กลับหน้าโปรไฟล์
            </Button>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
