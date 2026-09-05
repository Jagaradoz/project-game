type Tone = 'info' | 'warn' | 'error' | 'ok';

const TONE_CLASS: Record<Tone, string> = {
  info: 'border-line bg-panel text-muted',
  warn: 'border-[#6b5a1f] bg-[#2a2513] text-[#f2d98b]',
  error: 'border-[#6b2a2a] bg-[#3a1c1c] text-[#ffb4b4]',
  ok: 'border-[#255c42] bg-[#14291f] text-[#8fe3b8]',
};

interface NoticeProps {
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
}

export function Notice({ tone = 'info', title, children }: NoticeProps) {
  return (
    <div
      // Errors interrupt; the rest are announced only when the reader arrives.
      role={tone === 'error' ? 'alert' : 'note'}
      className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-sm ${TONE_CLASS[tone]}`}
    >
      {title && <strong className="font-semibold">{title}</strong>}
      <div>{children}</div>
    </div>
  );
}
