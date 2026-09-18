import Link from 'next/link';
import { LoaderCircle } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'navy';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'border border-transparent bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-hover',
  secondary:
    'border border-line-strong bg-surface text-text hover:border-muted hover:bg-elevated',
  ghost: 'border border-transparent bg-transparent text-muted hover:bg-surface hover:text-text',
  danger: 'border border-transparent bg-danger text-on-danger hover:brightness-110',
  navy: 'border border-transparent bg-navy text-on-navy hover:bg-navy-hover active:bg-navy-hover',
};

/**
 * 48px minimum height on md/lg: this is played standing, at arm's length. `sm`
 * exists for controls that sit inside the game canvas, where the screen is the
 * scene and a full-size button would cover it.
 */
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'min-h-9 gap-1.5 px-3 py-1.5 text-sm',
  md: 'min-h-12 gap-2 px-4 py-3',
  lg: 'min-h-14 gap-2.5 px-6 py-3.5 text-lg',
};

const BASE =
  'inline-flex cursor-pointer items-center justify-center rounded-md text-center font-semibold ' +
  'no-underline transition-colors duration-200 ' +
  // Recessed rather than filled: a solid grey block reads as a button that
  // still does something, which is exactly what a disabled control is not.
  'disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-subtle ' +
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isFullWidth?: boolean;
}

function classesFor({ variant, size = 'md', isFullWidth }: StyleProps & { variant: ButtonVariant }) {
  return `${BASE} ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${isFullWidth ? 'w-full' : ''}`;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, StyleProps {
  /** Decorative: it sits beside the label, so it is hidden from the a11y tree. */
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
  /** Swaps the icon for a spinner and marks the control busy. */
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isFullWidth,
  icon,
  iconPosition = 'start',
  isLoading,
  className = '',
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`${classesFor({ variant, size, isFullWidth })} ${className}`}
      {...rest}
    >
      <ButtonContent icon={icon} iconPosition={iconPosition} isLoading={isLoading}>
        {children}
      </ButtonContent>
    </button>
  );
}

interface LinkButtonProps extends React.ComponentProps<typeof Link>, StyleProps {
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
}

/** The same affordance as Button, for navigation rather than an action. */
export function LinkButton({
  variant = 'secondary',
  size = 'md',
  isFullWidth,
  icon,
  iconPosition = 'start',
  className = '',
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={`${classesFor({ variant, size, isFullWidth })} ${className}`} {...rest}>
      <ButtonContent icon={icon} iconPosition={iconPosition}>
        {children}
      </ButtonContent>
    </Link>
  );
}

function ButtonContent({
  icon,
  iconPosition,
  isLoading,
  children,
}: {
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
  isLoading?: boolean;
  children: React.ReactNode;
}) {
  const glyph = isLoading ? <LoaderCircle size={18} className="animate-spin" /> : icon;

  return (
    <>
      {glyph && iconPosition !== 'end' && <span aria-hidden>{glyph}</span>}
      {children}
      {glyph && iconPosition === 'end' && <span aria-hidden>{glyph}</span>}
    </>
  );
}
