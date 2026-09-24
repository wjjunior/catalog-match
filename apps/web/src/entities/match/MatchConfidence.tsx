import type { ConfidenceLabel } from '../../shared/api/client';
import { Badge } from '../../shared/ui/Badge';
import { ProgressBar } from '../../shared/ui/ProgressBar';

const NAME = 'Match confidence';

export function MatchConfidence({
  confidence,
  label,
}: {
  confidence: number;
  label?: ConfidenceLabel;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {NAME}
        </span>
        <span className="flex items-center gap-2">
          {label !== undefined && <Badge>{label}</Badge>}
          <span className="text-sm font-medium tabular-nums">{Math.round(confidence * 100)}%</span>
        </span>
      </div>
      <ProgressBar value={confidence} label={NAME} />
    </div>
  );
}
