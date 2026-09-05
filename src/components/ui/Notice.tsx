import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

type Tone = 'info' | 'warn' | 'error' | 'ok';

const TONE_CLASS: Record<Tone, string> = {
  info: 'border-accent/30 bg-accent-soft text-accent-text',
  warn: 'border-warn/40 bg-warn-soft text-warn-text',
  error: 'border-danger/40 bg-danger-soft text-danger-text',
  ok: 'border-ok/40 bg-ok-soft text-ok-text',
};

const TONE_ICON: Record<Tone, typeof Info> = {
  info: Info,
  warn: TriangleAlert,
  error: CircleAlert,
  ok: CircleCheck,
};

interface NoticeProps {
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
}

export function Notice({ tone = 'info', title, children }: NoticeProps) {
  const Glyph = TONE_ICON[tone];

  return (
    <div
      // Errors interrupt; the rest are announced only when the reader arrives.
      role={tone === 'error' ? 'alert' : 'note'}
      className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm ${TONE_CLASS[tone]}`}
    >
      {/* Decorative: the tone is already carried by the title and the copy. */}
      <Glyph aria-hidden size={18} className="mt-0.5 flex-none" />

      <div className="flex min-w-0 flex-col gap-1">
        {title && <strong className="font-semibold">{title}</strong>}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
