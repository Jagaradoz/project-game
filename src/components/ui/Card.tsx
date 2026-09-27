/**
 * Cards share the heavy outline and offset shadow; the primary tone highlights
 * the icon while preserving the same readable surface.
 */
export type CardTone = 'default' | 'primary';

interface CardProps {
  title?: string;
  /** Small print under the title -- a caveat, or where a number comes from. */
  note?: string;
  /** Decorative glyph beside the title; the title carries the meaning. */
  icon?: React.ReactNode;
  tone?: CardTone;
  /** Controls that belong to this card, right-aligned against the title. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Drop the default padding so a media header can run edge to edge. */
  padded?: boolean;
}

export function Card({
  title,
  note,
  icon,
  tone = 'default',
  actions,
  children,
  className = '',
  padded = true,
}: CardProps) {
  return (
    <section
      className={`flex flex-col rounded-none border-2 border-ink bg-surface shadow-[5px_5px_0_var(--color-ink)] ${
        padded ? 'gap-4 p-4 sm:p-5' : ''
      } ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className={`flex items-start ${tone === 'primary' ? 'gap-3' : 'gap-2.5'}`}>
            {icon &&
              (tone === 'primary' ? (
                <span
                  aria-hidden
                  className="mt-0.5 grid size-9 flex-none place-items-center border-2 border-ink bg-primary text-ink"
                >
                  {icon}
                </span>
              ) : (
                // Optically aligned with the title's cap height rather than boxed.
                <span aria-hidden className="mt-1 flex flex-none text-accent">
                  {icon}
                </span>
              ))}
            <div className="flex flex-col gap-0.5">
              {title && <h2 className="m-0 text-lg font-semibold text-text">{title}</h2>}
              {note && <p className="m-0 text-xs text-muted">{note}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-none gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
