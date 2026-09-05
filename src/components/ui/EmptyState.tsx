interface EmptyStateProps {
  title: string;
  children?: React.ReactNode;
}

/** Says why a list is empty and what to do about it, rather than showing nothing. */
export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-8 text-center">
      <p className="m-0 font-semibold text-text">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}
