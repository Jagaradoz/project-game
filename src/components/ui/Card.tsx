interface CardProps {
  title?: string;
  /** Small print under the title -- a caveat, or where a number comes from. */
  note?: string;
  /** Decorative glyph beside the title; the title carries the meaning. */
  icon?: React.ReactNode;
  /** Controls that belong to this card, right-aligned against the title. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, note, icon, actions, children, className = '' }: CardProps) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {icon && (
              <span
                aria-hidden
                className="mt-0.5 grid size-9 flex-none place-items-center rounded-lg bg-primary-soft text-primary"
              >
                {icon}
              </span>
            )}
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
