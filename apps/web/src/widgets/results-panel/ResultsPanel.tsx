'use client';

import { useState } from 'react';

import { AlternativeCard } from '../../entities/match/AlternativeCard';
import { MatchCard } from '../../entities/match/MatchCard';
import { isHeadlineNote, StatusLine } from '../../entities/match/StatusLine';
import { ExampleChips } from '../../features/match-query/ExampleChips';
import { QueryForm } from '../../features/match-query/QueryForm';
import { useMatchQuery } from '../../features/match-query/useMatchQuery';
import { CustomerCombobox } from '../../features/select-customer/CustomerCombobox';
import type { CustomerSummary, MatchResponse } from '../../shared/api/client';

function Results({ response }: { response: MatchResponse }) {
  // The status line already speaks for the notes it promotes; the rest belong in the list.
  const notes = response.notes.filter((entry) => !isHeadlineNote(entry.code));

  return (
    <>
      <StatusLine response={response} />

      {response.results.length > 0 && (
        <section className="flex flex-col gap-2.5" aria-labelledby="matches">
          <h2
            className="m-0 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground"
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
            className="m-0 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground"
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

/** docs/DESIGN.md 5.5 asks for this on the page, and 12 makes it the mitigation for a
 * reader taking the number for a calibrated probability. The thresholds themselves stay in
 * matching/config.ts; naming them here would be a second home for a tunable. */
function ConfidenceSemantics() {
  return (
    <aside
      className="mt-8 border-t border-border pt-4 text-[0.8125rem] leading-normal text-muted-foreground"
      role="note"
      aria-label="what confidence means"
    >
      <strong>Confidence</strong> is the model&rsquo;s estimate that this SKU is the intended one,
      given the query, the selected customer and an explicit set of assumptions. It is not a
      measured frequency, and it is comparable within one answer rather than across answers. High,
      Medium and Low are bands of that estimate, attached after the calibration measurement rather
      than promised before it. An alternative carries <strong>closeness</strong> instead, because it
      is not the thing that was asked for.
    </aside>
  );
}

export function ResultsPanel() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CustomerSummary>();
  const { state, run } = useMatchQuery();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="mb-2 text-3xl tracking-tight">Catalog Match</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr] sm:items-start">
        <QueryForm
          value={query}
          onChange={setQuery}
          onSubmit={() => {
            run(query, selected?.customerId);
          }}
          busy={state.phase === 'loading'}
        />
        <CustomerCombobox onSelect={setSelected} />
      </div>

      <ExampleChips
        onPick={(picked) => {
          setQuery(picked);
          run(picked, selected?.customerId);
        }}
      />

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
        {state.phase === 'ready' && <Results response={state.response} />}
      </div>

      <ConfidenceSemantics />
    </main>
  );
}
