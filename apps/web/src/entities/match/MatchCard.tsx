import type { Match } from '../../shared/api/client';
import { Badge } from '../../shared/ui/Badge';
import { ProgressBar } from '../../shared/ui/ProgressBar';

import { AttributeChips } from './AttributeChips';
import { CustomerOrderHistory } from './CustomerOrderHistory';

export function MatchCard({ match }: { match: Match }) {
  const { explanation } = match;

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <h3 className="m-0 text-base font-semibold leading-[1.35]">{match.description}</h3>
        <Badge tone={match.active ? 'active' : 'inactive'}>
          {match.active ? 'Active' : 'Discontinued'}
        </Badge>
      </header>

      <p className="-mt-2 font-mono text-sm text-muted-foreground">{match.sku}</p>

      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          confidence
        </span>
        <ProgressBar value={match.confidence} label="confidence" />
        <span className="text-sm tabular-nums">{Math.round(match.confidence * 100)}%</span>
        {match.label !== undefined && <Badge>{match.label}</Badge>}
      </div>

      <AttributeChips explanation={explanation} />

      {explanation.personalization !== undefined && (
        <CustomerOrderHistory personalization={explanation.personalization} />
      )}
    </article>
  );
}
