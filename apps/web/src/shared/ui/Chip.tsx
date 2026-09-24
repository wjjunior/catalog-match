import type { ReactNode } from 'react';

import { cn, focusRing } from '../lib/utils';

interface ChipProps {
  children: ReactNode;
  tone?: 'matched' | 'unspecified' | 'unverified' | 'neutral';
  onClick?: () => void;
}

const TONES: Record<NonNullable<ChipProps['tone']>, string> = {
  neutral: 'border-transparent bg-secondary text-foreground',
  matched: 'border-transparent bg-secondary text-foreground',
  unspecified: 'border-dashed border-border bg-transparent text-muted-foreground',
  unverified: 'border-transparent bg-warn-surface text-warn',
};

const BASE = 'inline-flex items-baseline gap-1.5 rounded-md border px-2.5 py-1 text-left text-sm';

export function Chip({ children, tone = 'neutral', onClick }: Readonly<ChipProps>) {
  if (onClick === undefined) {
    return <span className={cn(BASE, TONES[tone])}>{children}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(BASE, TONES[tone], 'cursor-pointer hover:border-border', focusRing)}
    >
      {children}
    </button>
  );
}
