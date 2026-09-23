import type { PersonalizationExplanation } from '../../shared/api/client';

export function PersonalizationNote({
  personalization,
}: {
  personalization: PersonalizationExplanation;
}) {
  const { reason, prior, overriddenBy } = personalization;

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5 rounded-r-md border-l-[3px] border-primary bg-secondary px-3 py-2">
      <p className="flex-[1_1_100%] text-sm text-foreground">{reason}</p>
      <span className="text-xs uppercase tracking-[0.04em] text-muted-foreground">prior</span>
      <span className="text-sm tabular-nums">{Math.round(prior * 100)}%</span>
      {overriddenBy !== undefined && overriddenBy.length > 0 && (
        <span className="text-xs uppercase tracking-[0.04em] text-muted-foreground">
          overridden by {overriddenBy.join(', ')}
        </span>
      )}
    </div>
  );
}
