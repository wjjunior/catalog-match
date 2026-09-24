interface ProgressBarProps {
  /** A fraction in the unit interval; the bar reports whole percents. */
  value: number;
  label: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-secondary"
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* The only inline style in apps/web: a runtime percentage cannot be a utility class. */}
      <div className="h-full rounded-[inherit] bg-primary" style={{ width: `${percent}%` }} />
    </div>
  );
}
