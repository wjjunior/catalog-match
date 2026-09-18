import type { ReactNode } from 'react';

import styles from './Badge.module.css';

interface BadgeProps {
  children: ReactNode;
  tone?: 'active' | 'inactive' | 'neutral';
}

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {children}
    </span>
  );
}
