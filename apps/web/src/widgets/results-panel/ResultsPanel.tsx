'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

import { AlternativeCard } from '../../entities/match/AlternativeCard';
import { EmptyState } from '../../entities/match/EmptyState';
import { LoadingSkeleton } from '../../entities/match/LoadingSkeleton';
import { MatchCard } from '../../entities/match/MatchCard';
import { MatchSummary } from '../../entities/match/MatchSummary';
import { isHeadlineNote } from '../../entities/match/StatusLine';
import { ExampleChips } from '../../features/match-query/ExampleChips';
import { QueryForm } from '../../features/match-query/QueryForm';
import { useMatchQuery } from '../../features/match-query/useMatchQuery';
import { CustomerCombobox } from '../../features/select-customer/CustomerCombobox';
import type { CustomerSummary, MatchResponse } from '../../shared/api/client';
import { Alert, AlertDescription, AlertTitle } from '../../shared/ui/alert';
import { Button } from '../../shared/ui/Button';

function Alternatives({ alternatives }: Readonly<{ alternatives: MatchResponse['alternatives'] }>) {
  if (alternatives.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="alternatives">
      <h2
        className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        id="alternatives"
      >
        Alternatives
      </h2>
      <div className="flex flex-col gap-3">
        {alternatives.map((option) => (
          <AlternativeCard key={option.sku} alternative={option} />
        ))}
      </div>
    </section>
  );
}

function Results({
  response,
  customerName,
}: Readonly<{ response: MatchResponse; customerName?: string }>) {
  if (response.results.length === 0) {
    return (
      <>
        <EmptyState response={response} />
        <Alternatives alternatives={response.alternatives} />
      </>
    );
  }

  // The status line already speaks for the notes it promotes; the rest belong in the list.
  const notes = response.notes.filter((entry) => !isHeadlineNote(entry.code));

  return (
    <>
      <MatchSummary response={response} customerName={customerName} />

      <section className="flex flex-col gap-2.5" aria-labelledby="matches">
        <h2
          className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          id="matches"
        >
          Matches
        </h2>
        <div className="flex flex-col gap-3">
          {response.results.map((result) => (
            <MatchCard key={result.sku} match={result} />
          ))}
        </div>
      </section>

      {notes.length > 0 && (
        <ul
          className="m-0 flex flex-col gap-1.5 pl-4.5 text-sm text-muted-foreground"
          aria-label="notes"
        >
          {notes.map((entry, index) => (
            <li key={`${entry.code}-${String(index)}`}>{entry.message}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ResultsPanel() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CustomerSummary>();
  // The customer the answer was asked for, which a later selection must not rewrite.
  const [askedFor, setAskedFor] = useState<string>();
  const { state, run } = useMatchQuery();

  function ask(text: string) {
    setAskedFor(selected?.customerName);
    run(text, selected?.customerId);
  }

  // Re-asks the same query with whichever customer is selected now, same as any other
  // submission; `run` aborts anything still pending, so this is safe to click right away.
  function retry() {
    ask(query);
  }

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
        <QueryForm
          value={query}
          onChange={setQuery}
          onSubmit={() => {
            ask(query);
          }}
          busy={state.phase === 'loading'}
          customerField={<CustomerCombobox onSelect={setSelected} />}
        />

        <ExampleChips
          onPick={(picked) => {
            setQuery(picked);
            ask(picked);
          }}
        />
      </section>

      <div className="flex flex-col gap-4">
        {state.phase === 'idle' && (
          <p className="m-0 text-muted-foreground">
            Type a fastener description, or pick an example query.
          </p>
        )}
        {state.phase === 'loading' && <LoadingSkeleton />}
        {state.phase === 'failed' && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Match failed</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <p className="m-0">{state.message}</p>
              <Button variant="quiet" onClick={retry}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {state.phase === 'ready' && <Results response={state.response} customerName={askedFor} />}
      </div>
    </main>
  );
}
