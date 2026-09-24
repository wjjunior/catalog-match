interface ProgressBarProps {
  /** A fraction in the unit interval; the bar reports whole percents. */
  readonly value: number;
  readonly label: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <progress
      className="h-2 w-full appearance-none overflow-hidden rounded-full border-none bg-secondary [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
      value={percent}
      max={100}
      aria-label={label}
    />
  );
}
