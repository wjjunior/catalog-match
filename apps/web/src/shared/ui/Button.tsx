import type { ButtonHTMLAttributes } from 'react';

import { cn, focusRing } from '../lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'quiet';
}

export function Button({
  variant = 'primary',
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      data-variant={variant}
      className={cn(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm',
        'transition-colors',
        focusRing,
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary'
          ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90'
          : 'border border-border bg-card text-foreground hover:bg-secondary',
        className,
      )}
    >
      {children}
    </button>
  );
}
