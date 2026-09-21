/** The vocabulary of docs/DESIGN.md 7.4. Membership only: `takeIntent` tests it with
 * `includes`, widest span first, so the order of this array decides nothing. */
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
