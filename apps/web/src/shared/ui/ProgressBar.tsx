import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  /** A fraction in the unit interval; the bar reports whole percents. */
  value: number;
  label: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={styles.fill} style={{ width: `${percent}%` }} />
    </div>
  );
}
