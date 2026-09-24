import type { MatchResponse } from '../../shared/api/client';

import { MissingAttributes } from './MissingAttributes';
import { StatusLine } from './StatusLine';

function countedHeadline(response: MatchResponse): string | undefined {
  if (response.status !== 'unique' && response.status !== 'ambiguous') return undefined;

  const count = response.compatibleCount;

  return count === 1 ? '1 compatible item' : `${String(count)} compatible items`;
}

// The name is the one the request carried; history is claimed only where a result says so.
function customerLine(customerName: string, personalized: boolean): string {
  return personalized
    ? `Matched for ${customerName}, ranked with their order history.`
    : `Matched for ${customerName}.`;
}

export function MatchSummary({
  response,
  customerName,
}: {
  response: MatchResponse;
  customerName?: string;
}) {
  const headline = countedHeadline(response);
  const unspecified = response.results[0]?.explanation.unspecified ?? [];
  const personalized = response.results.some(
    (result) => result.explanation.personalization !== undefined,
  );

  return (
    <section
      aria-label="Match summary"
      className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-1">
        {headline !== undefined && (
          <h2 className="m-0 text-xl font-semibold tracking-tight">{headline}</h2>
        )}
        <StatusLine response={response} lead={headline === undefined} />
      </div>

      {customerName !== undefined && (
        <p className="m-0 text-sm text-muted-foreground">
          {customerLine(customerName, personalized)}
        </p>
      )}

      <MissingAttributes attributes={unspecified} label="Missing information" />
    </section>
  );
}
