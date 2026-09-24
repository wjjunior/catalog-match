'use client';

import { useState } from 'react';

import { AlternativeCard } from '../../entities/match/AlternativeCard';
import { MatchCard } from '../../entities/match/MatchCard';
import { MatchSummary } from '../../entities/match/MatchSummary';
import { isHeadlineNote } from '../../entities/match/StatusLine';
import { ExampleChips } from '../../features/match-query/ExampleChips';
import { QueryForm } from '../../features/match-query/QueryForm';
import { useMatchQuery } from '../../features/match-query/useMatchQuery';
import { CustomerCombobox } from '../../features/select-customer/CustomerCombobox';
import type { CustomerSummary, MatchResponse } from '../../shared/api/client';

function Results({ response, customerName }: { response: MatchResponse; customerName?: string }) {
  // The status line already speaks for the notes it promotes; the rest belong in the list.
  const notes = response.notes.filter((entry) => !isHeadlineNote(entry.code));

  return (
    <>
      <MatchSummary response={response} customerName={customerName} />

      {response.results.length > 0 && (
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
      )}

      {response.alternatives.length > 0 && (
        <section className="flex flex-col gap-2.5" aria-labelledby="alternatives">
          <h2
            className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            id="alternatives"
          >
            Alternatives
          </h2>
          <div className="flex flex-col gap-3">
            {response.alternatives.map((option) => (
              <AlternativeCard key={option.sku} alternative={option} />
            ))}
          </div>
        </section>
      )}

      {notes.length > 0 && (
        <ul
          className="m-0 flex flex-col gap-1.5 pl-[1.125rem] text-sm text-muted-foreground"
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
        {state.phase === 'loading' && (
          <p className="m-0 text-muted-foreground" role="status">
            Matching…
          </p>
        )}
        {state.phase === 'failed' && (
          <p className="m-0 rounded-lg bg-warn-surface px-3.5 py-2.5 text-warn" role="alert">
            {state.message}
          </p>
        )}
        {state.phase === 'ready' && <Results response={state.response} customerName={askedFor} />}
      </div>
    </main>
  );
}
