import type { ButtonHTMLAttributes } from 'react';

import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'quiet';
}

export function Button({ variant = 'primary', type = 'button', ...rest }: ButtonProps) {
  return <button {...rest} type={type} className={styles.button} data-variant={variant} />;
}
