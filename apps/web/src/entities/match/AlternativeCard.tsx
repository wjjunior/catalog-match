import type { Alternative } from '../../shared/api/client';
import { ProgressBar } from '../../shared/ui/ProgressBar';

import { ItemHeader } from './ItemHeader';
import { MatchedAttributes } from './MatchedAttributes';

// An alternative is not a match: it carries closeness and the constraints that were given
// up, and never a confidence.
export function AlternativeCard({ alternative }: { alternative: Alternative }) {
  return (
    <article className="flex flex-col gap-3.5 rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-border sm:p-5">
      <ItemHeader
        description={alternative.description}
        sku={alternative.sku}
        active={alternative.active}
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Closeness
          </span>
          <span className="text-sm font-medium tabular-nums">
            {Math.round(alternative.closeness * 100)}%
          </span>
        </div>
        <ProgressBar value={alternative.closeness} label="Closeness" />
      </div>

      <p className="m-0 text-sm text-muted-foreground">relaxed: {alternative.relaxed.join(', ')}</p>

      <MatchedAttributes matched={alternative.explanation.matched} />
    </article>
  );
}
