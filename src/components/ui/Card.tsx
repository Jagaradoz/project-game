interface CardProps {
  title?: string;
  /** Small print under the title -- a TOR reference, or a caveat. */
  note?: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, note, children, className = '' }: CardProps) {
  return (
    <section className={`flex flex-col gap-3 rounded-lg bg-panel p-4 ${className}`}>
      {title && (
        <header className="flex flex-col gap-1">
          <h2 className="m-0 text-base font-semibold text-text">{title}</h2>
          {note && <p className="m-0 text-xs text-muted">{note}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
