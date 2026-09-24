import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

interface BadgeProps {
  children: ReactNode;
  tone?: 'active' | 'inactive' | 'neutral';
}

const TONES: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-secondary text-muted-foreground',
  active: 'bg-ok-surface text-ok',
  inactive: 'bg-warn-surface text-warn',
};

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
