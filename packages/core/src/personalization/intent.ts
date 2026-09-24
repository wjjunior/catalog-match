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
  phrase?: string;
}

export function detectIntent(intentCandidates: readonly string[]): Intent {
  const phrase = intentCandidates.reduce<string | undefined>(
    (longest, candidate) =>
      longest === undefined || candidate.length > longest.length ? candidate : longest,
    undefined,
  );

  return phrase === undefined ? {} : { phrase };
}
