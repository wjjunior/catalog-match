import type { MatchResponse, NoteCode } from '../../shared/api/client';

import styles from './StatusLine.module.css';

// A note already says it in core's words; only the counted sentences are composed here,
// because no note carries a count. Every other note renders in the list below the cards.
const HEADLINE_NOTES: readonly NoteCode[] = ['failedConstraint', 'customerRequired'];

export function isHeadlineNote(code: NoteCode): boolean {
  return HEADLINE_NOTES.includes(code);
}

function list(items: readonly string[]): string {
  const last = items.at(-1);
  if (last === undefined) return '';
  if (items.length === 1) return last;
  return `${items.slice(0, -1).join(', ')} or ${last}`;
}

function counted(response: MatchResponse): string {
  if (response.compatibleCount === 1) return '1 match';

  const banner = `${response.compatibleCount} compatible options`;
  const disambiguateBy = response.results[0]?.explanation.disambiguateBy ?? [];

  return disambiguateBy.length === 0 ? banner : `${banner}, specify ${list(disambiguateBy)}`;
}

function statusText(response: MatchResponse): string {
  const headline = response.notes.find((entry) => isHeadlineNote(entry.code));
  if (headline !== undefined) return headline.message;

  if (response.status === 'unparsed') {
    return response.results.length > 0
      ? 'could not parse that query; showing the closest text matches'
      : 'could not parse that query';
  }

  if (response.status === 'none') return 'no compatible item in this catalog';

  // History results are ranked by recency over past orders, not a posterior over a
  // compatible set, so they must not borrow counted()'s "compatible options" banner.
  if (response.status === 'history') {
    return response.results.length > 0
      ? "items from this customer's order history, most recent first"
      : 'no history item in this catalog';
  }

  return counted(response);
}

export function StatusLine({ response }: { response: MatchResponse }) {
  return (
    <p className={styles.status} role="status">
      {statusText(response)}
    </p>
  );
}
