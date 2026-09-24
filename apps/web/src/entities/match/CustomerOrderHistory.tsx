import { History } from 'lucide-react';

import type { PersonalizationExplanation } from '../../shared/api/client';

// `reason` is a sentence core composed; the quantity and the date inside it are not
// separate fields, so the browser renders it whole rather than taking it apart.
export function CustomerOrderHistory({
  personalization,
}: Readonly<{
  personalization: PersonalizationExplanation;
}>) {
  const { reason, prior, overriddenBy } = personalization;

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5 rounded-lg border border-primary/30 bg-secondary px-3 py-2.5">
      <span className="flex flex-[1_1_100%] items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <History className="size-3.5" aria-hidden="true" />
        Customer order history
      </span>
      <p className="flex-[1_1_100%] text-sm text-foreground">{reason}</p>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        prior
      </span>
      <span className="text-sm tabular-nums">{Math.round(prior * 100)}%</span>
      {overriddenBy !== undefined && overriddenBy.length > 0 && (
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          overridden by {overriddenBy.join(', ')}
        </span>
      )}
    </div>
  );
}
