type BadgeTone = 'neutral' | 'primary' | 'ok' | 'warn' | 'danger' | 'navy';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-elevated text-ink',
  primary: 'bg-primary text-ink',
  navy: 'bg-navy-soft text-navy-text',
  ok: 'bg-ok-soft text-ok-text',
  warn: 'bg-warn-soft text-warn-text',
  danger: 'bg-danger-soft text-danger-text',
};

interface BadgeProps {
  tone?: BadgeTone;
  /** Decorative; the label is what conveys the state. */
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * A status pill. It always carries a word, never colour alone -- the states it
 * marks (locked, cleared, ready) have to survive both a colour-blind reader and
 * a screen reader.
 */
export function Badge({ tone = 'neutral', icon, children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-none border-2 border-ink px-2.5 py-0.5 text-xs font-extrabold whitespace-nowrap ${TONE_CLASS[tone]} ${className}`}
    >
      {icon && <span aria-hidden className="flex">{icon}</span>}
      {children}
    </span>
  );
}
