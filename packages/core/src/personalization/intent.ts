/** The vocabulary of docs/DESIGN.md 7.4, longest first because the query parser scans it
 * in order and claims the first phrase that fits: `last time` must win over `time`. */
export const INTENT_PHRASES: readonly string[] = [
  'what we always get',
  'previous order',
  'like before',
  'last time',
  'reorder',
  'usual',
  'again',
  'same',
];

export interface Intent {
  isHistory: boolean;
  phrase?: string;
}

/** The longest candidate is the most explicit reference and the one the note quotes:
 * `the same washers as last time` resolves to `last time`, not to `same`. */
export function detectIntent(intentCandidates: readonly string[]): Intent {
  const phrase = intentCandidates.reduce<string | undefined>(
    (longest, candidate) =>
      longest === undefined || candidate.length > longest.length ? candidate : longest,
    undefined,
  );

  return phrase === undefined ? { isHistory: false } : { isHistory: true, phrase };
}
