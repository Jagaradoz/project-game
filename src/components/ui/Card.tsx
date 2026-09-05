/**
 * `primary` keeps the orange chip. It is the 10% of the palette, so at most one
 * card on a screen should ask for it -- the one that leads. Everything else
 * takes `default`, where the glyph sits inline in the accent indigo.
 *
 * The chip used to be unconditional, which is how twelve identical
 * orange-square-plus-title-plus-grey-paragraph blocks ended up across the app.
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
}

export function Card({
  title,
  note,
  icon,
  tone = 'default',
  actions,
  children,
  className = '',
}: CardProps) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className={`flex items-start ${tone === 'primary' ? 'gap-3' : 'gap-2.5'}`}>
            {icon &&
              (tone === 'primary' ? (
                <span
                  aria-hidden
                  className="mt-0.5 grid size-9 flex-none place-items-center rounded-lg bg-primary-soft text-primary"
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
