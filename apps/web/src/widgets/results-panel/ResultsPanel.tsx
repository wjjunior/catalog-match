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

import styles from './ResultsPanel.module.css';

function Results({ response }: { response: MatchResponse }) {
  // The status line already speaks for the notes it promotes; the rest belong in the list.
  const notes = response.notes.filter((entry) => !isHeadlineNote(entry.code));

  return (
    <>
      <StatusLine response={response} />

      {response.results.length > 0 && (
        <section className={styles.section} aria-labelledby="matches">
          <h2 className={styles.sectionTitle} id="matches">
            Matches
          </h2>
          <div className={styles.cards}>
            {response.results.map((result) => (
              <MatchCard key={result.sku} match={result} />
            ))}
          </div>
        </section>
      )}

      {response.alternatives.length > 0 && (
        <section className={styles.section} aria-labelledby="alternatives">
          <h2 className={styles.sectionTitle} id="alternatives">
            Alternatives
          </h2>
          <div className={styles.cards}>
            {response.alternatives.map((option) => (
              <AlternativeCard key={option.sku} alternative={option} />
            ))}
          </div>
        </section>
      )}

      {notes.length > 0 && (
        <ul className={styles.notes} aria-label="notes">
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
  const { state, run } = useMatchQuery();

  return (
    <main className={styles.panel}>
      <h1 className={styles.title}>Catalog Match</h1>

      <div className={styles.controls}>
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

      <div className={styles.results}>
        {state.phase === 'idle' && (
          <p className={styles.hint}>Type a fastener description, or pick an example query.</p>
        )}
        {state.phase === 'loading' && (
          <p className={styles.hint} role="status">
            Matching…
          </p>
        )}
        {state.phase === 'failed' && (
          <p className={styles.error} role="alert">
            {state.message}
          </p>
        )}
        {state.phase === 'ready' && <Results response={state.response} />}
      </div>
    </main>
  );
}
