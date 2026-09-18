import type { ReactNode } from 'react';

import styles from './Chip.module.css';

interface ChipProps {
  children: ReactNode;
  tone?: 'matched' | 'unspecified' | 'unverified' | 'neutral';
  onClick?: () => void;
}

export function Chip({ children, tone = 'neutral', onClick }: ChipProps) {
  if (onClick === undefined) {
    return (
      <span className={styles.chip} data-tone={tone}>
        {children}
      </span>
    );
  }

  return (
    <button type="button" className={styles.chip} data-tone={tone} onClick={onClick}>
      {children}
    </button>
  );
}
