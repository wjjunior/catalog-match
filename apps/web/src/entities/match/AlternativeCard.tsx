import type { Alternative } from '../../shared/api/client';
import { Badge } from '../../shared/ui/Badge';
import { ProgressBar } from '../../shared/ui/ProgressBar';

import { AttributeChips } from './AttributeChips';

export function AlternativeCard({ alternative }: { alternative: Alternative }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <h3 className="m-0 text-base font-semibold leading-[1.35]">{alternative.description}</h3>
        <Badge tone={alternative.active ? 'active' : 'inactive'}>
          {alternative.active ? 'Active' : 'Discontinued'}
        </Badge>
      </header>

      <p className="-mt-2 font-mono text-sm text-muted-foreground">{alternative.sku}</p>

      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          closeness
        </span>
        <ProgressBar value={alternative.closeness} label="closeness" />
        <span className="text-sm tabular-nums">{Math.round(alternative.closeness * 100)}%</span>
      </div>

      <p className="text-sm text-muted-foreground">relaxed: {alternative.relaxed.join(', ')}</p>

      <AttributeChips explanation={alternative.explanation} />
    </article>
  );
}
