import type { Match } from '../../shared/api/client';

import { CustomerOrderHistory } from './CustomerOrderHistory';
import { ItemHeader } from './ItemHeader';
import { MatchConfidence } from './MatchConfidence';
import { MatchDetails } from './MatchDetails';
import { MatchedAttributes } from './MatchedAttributes';
import { MissingAttributes } from './MissingAttributes';

export function MatchCard({ match }: { match: Match }) {
  const { explanation } = match;

  return (
    <article className="flex flex-col gap-3.5 rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-border sm:p-5">
      <ItemHeader description={match.description} sku={match.sku} active={match.active} />

      <MatchConfidence confidence={match.confidence} label={match.label} />

      <MatchedAttributes matched={explanation.matched} />

      <MissingAttributes attributes={explanation.unspecified} label="Missing" />

      {explanation.personalization !== undefined && (
        <CustomerOrderHistory personalization={explanation.personalization} />
      )}

      <MatchDetails
        sku={match.sku}
        description={match.description}
        active={match.active}
        explanation={explanation}
      />
    </article>
  );
}
