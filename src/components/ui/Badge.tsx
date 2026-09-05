type BadgeTone = 'neutral' | 'primary' | 'ok' | 'warn' | 'danger';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-elevated text-accent-text',
  primary: 'border-primary/40 bg-primary-soft text-primary',
  ok: 'border-ok/40 bg-ok-soft text-ok-text',
  warn: 'border-warn/40 bg-warn-soft text-warn-text',
  danger: 'border-danger/40 bg-danger-soft text-danger-text',
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_CLASS[tone]} ${className}`}
    >
      {icon && <span aria-hidden className="flex">{icon}</span>}
      {children}
    </span>
  );
}
