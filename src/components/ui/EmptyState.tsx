interface EmptyStateProps {
  title: string;
  /** Decorative glyph above the title. */
  icon?: React.ReactNode;
  /** What to do about it -- usually a LinkButton. */
  action?: React.ReactNode;
  children?: React.ReactNode;
}

/** Says why a list is empty and what to do about it, rather than showing nothing. */
export function EmptyState({ title, icon, action, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-none border-2 border-dashed border-ink bg-surface px-4 py-10 text-center">
      {icon && (
        <span aria-hidden className="grid size-11 place-items-center border-2 border-ink bg-primary text-ink">
          {icon}
        </span>
      )}
      <p className="m-0 font-semibold text-text">{title}</p>
      {children && <div className="max-w-sm text-sm text-text/80">{children}</div>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
