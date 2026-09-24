import { describe, expect, it } from 'vitest';

import { parseQuery } from '../parsing/queryParser';
import { INTENT_PHRASES, detectIntent } from './intent';

describe('detecting a history reference', () => {
  it('reports no reference when the query carries no phrase', () => {
    expect(detectIntent([])).toEqual({});
  });

  it('reports a reference and names the phrase', () => {
    expect(detectIntent(['reorder'])).toEqual({ phrase: 'reorder' });
  });

  it('names the longest phrase, so the note quotes the explicit reference', () => {
    expect(detectIntent(['same', 'last time'])).toEqual({ phrase: 'last time' });
  });

  it('keeps the first of two phrases of equal length', () => {
    expect(detectIntent(['usual', 'again'])).toEqual({ phrase: 'usual' });
  });
});

describe('the phrases the parser claims', () => {
  it('covers the eight of docs/DESIGN.md 7.4', () => {
    expect([...INTENT_PHRASES].sort()).toEqual([
      'again',
      'last time',
      'like before',
      'previous order',
      'reorder',
      'same',
      'usual',
      'what we always get',
    ]);
  });

  it.each(INTENT_PHRASES)('claims %s, so no word of it reaches the residue', (phrase) => {
    const { spec, intentCandidates } = parseQuery(phrase);

    expect(intentCandidates).toEqual([phrase]);
    expect(spec.residue).toEqual([]);
    expect(detectIntent(intentCandidates).phrase).toBe(phrase);
  });
});
