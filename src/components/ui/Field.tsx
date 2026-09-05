'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';

interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** Validation message. Its presence is what marks the field invalid. */
  error?: string;
  /** Shown under the field when there is no error -- guidance, not a warning. */
  hint?: string;
  /** Decorative glyph inside the field; the label carries the meaning. */
  icon?: React.ReactNode;
}

/**
 * A labelled input that stays accessible: the label is bound by id, the error
 * is announced, and aria-invalid follows the error rather than being set by hand
 * at each call site.
 *
 * A password field gets a reveal toggle, which is what lets a password manager
 * user and a careful typist both check what they entered.
 */
export function Field({ label, error, hint, icon, className = '', type, ...rest }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;

  const [isRevealed, setIsRevealed] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword && isRevealed ? 'text' : type;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>

      <div className="relative flex items-center">
        {icon && (
          <span aria-hidden className="pointer-events-none absolute left-3 flex text-muted">
            {icon}
          </span>
        )}

        <input
          id={id}
          type={resolvedType}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={`min-h-12 w-full rounded-lg border bg-bg py-2.5 text-base text-text transition-colors placeholder:text-subtle hover:border-muted focus:border-primary disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted ${
            icon ? 'pl-10' : 'pl-3'
          } ${isPassword ? 'pr-12' : 'pr-3'} ${error ? 'border-danger' : 'border-line-strong'} ${className}`}
          {...rest}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setIsRevealed((current) => !current)}
            // The control has no visible text, so the glyph alone would leave it
            // unnamed; the state is in the name rather than only in the icon.
            aria-label={isRevealed ? 'Hide password' : 'Show password'}
            aria-pressed={isRevealed}
            className="absolute right-1 grid size-10 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:text-text"
          >
            {isRevealed ? <EyeOff aria-hidden size={18} /> : <Eye aria-hidden size={18} />}
          </button>
        )}
      </div>

      {error ? (
        <p id={messageId} role="alert" className="m-0 text-xs text-danger-text">
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
