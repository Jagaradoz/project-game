import Link from 'next/link';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-accent text-[#04121a] border border-transparent',
  secondary: 'border border-line text-text',
  ghost: 'border border-transparent text-muted hover:text-accent',
};

/** 48px minimum height throughout: this is played standing, at arm's length. */
const BASE =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg px-4 py-3 text-center font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:border-transparent disabled:bg-off disabled:text-[#aab4bd]';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  isFullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  isFullWidth,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE} ${VARIANT_CLASS[variant]} ${isFullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  );
}

interface LinkButtonProps extends React.ComponentProps<typeof Link> {
  variant?: Variant;
  isFullWidth?: boolean;
}

/** The same affordance as Button, for navigation rather than an action. */
export function LinkButton({
  variant = 'secondary',
  isFullWidth,
  className = '',
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      className={`${BASE} ${VARIANT_CLASS[variant]} ${isFullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  );
}
