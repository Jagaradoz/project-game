'use client';

import { useId } from 'react';

interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** Validation message. Its presence is what marks the field invalid. */
  error?: string;
  /** Shown under the field when there is no error -- guidance, not a warning. */
  hint?: string;
}

/**
 * A labelled input that stays accessible: the label is bound by id, the error
 * is announced, and aria-invalid follows the error rather than being set by hand
 * at each call site.
 */
export function Field({ label, error, hint, className = '', ...rest }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>

      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={`min-h-12 rounded-lg border bg-surface px-3 py-2.5 text-base text-text outline-hidden transition-colors placeholder:text-muted focus:border-accent disabled:cursor-not-allowed disabled:bg-panel disabled:text-muted ${
          error ? 'border-enemy' : 'border-line'
        } ${className}`}
        {...rest}
      />

      {error ? (
        <p id={messageId} role="alert" className="m-0 text-xs text-[#ffb4b4]">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="m-0 text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
