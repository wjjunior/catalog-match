import { describe, expect, it } from 'vitest';

import type { MatchResponse } from '../../src/domain/match';
import { runBaseline } from '../../src/eval/baseline';
import type { EvalCase } from '../../src/eval/loader';
import { compatibleSet } from '../../src/matching/compatibility';
import { buildIndex, LexicalOnlyMatcher } from '../../src/matching/lexicalFallback';
import { parseQuery } from '../../src/parsing/queryParser';
import { core } from './setup';

const ask = (query: string): MatchResponse => core.matchQuery({ query });

const skus = (response: MatchResponse): string[] => response.results.map((match) => match.sku);

/** The repo's own compatible set as the oracle: a result it excludes is a result that
 * contradicts something the parser recognized. */
function contradicting(response: MatchResponse): string[] {
  const admitted = new Set(
    compatibleSet(response.parsed, core.catalog.active()).map((item) => item.sku),
  );

  return skus(response).filter((sku) => !admitted.has(sku));
}

describe('the lexical fallback and the attributes the parser did recognize', () => {
  it('answers A2 plain DIN 933 from the one item that satisfies all three', () => {
    const response = ask('A2 plain DIN 933');

    expect(response.parsed.provenance).toMatchObject({
      material: 'explicit',
      finish: 'explicit',
      standard: 'explicit',
    });
    expect(response.status).toBe('unparsed');
    expect(skus(response)).toEqual(['PXHEX5812A2PL0240']);
    expect(contradicting(response)).toEqual([]);
    expect(response.results[0]?.confidence).toBeCloseTo(core.config.lexicalCap, 10);
  });

  it('ranks brass CLASS 8 out of the pool entirely and takes the backoff', () => {
    const response = ask('brass CLASS 8');

    expect(compatibleSet(response.parsed, core.catalog.active())).toHaveLength(0);
    expect(response.status).toBe('none');
    expect(response.results).toEqual([]);
    expect(response.notes).toContainEqual({
      code: 'failedConstraint',
      message: 'no CLASS 8 item in brass',
    });
  });

  it('offers the backoff alternatives with closeness and never a confidence', () => {
    const response = ask('brass CLASS 8');

    expect(response.alternatives).toHaveLength(3);
    for (const alternative of response.alternatives) {
      expect(alternative.closeness).toBeCloseTo(0.5, 10);
      expect(alternative.relaxed).toEqual(['standard']);
      expect(alternative.explanation.closeness).toBeCloseTo(0.5, 10);
      expect(alternative).not.toHaveProperty('confidence');
      expect(core.catalog.bySku(alternative.sku)?.spec.material?.value).toBe('brass');
    }
  });

  it('still ranks a fallback query whose filtered pool is not empty', () => {
    const response = ask('18-8 SS zinc');

    expect(response.status).toBe('unparsed');
    expect(response.results).toHaveLength(3);
    expect(contradicting(response)).toEqual([]);
  });

  it('keeps the three the baseline ranks where the pool admits all three', () => {
    const response = ask('plain zinc');

    expect(response.status).toBe('unparsed');
    expect(response.results).toHaveLength(3);
    expect(contradicting(response)).toEqual([]);
  });
});

describe('the baseline of docs/DESIGN.md 10.4 scores unfiltered', () => {
  const query = 'brass CLASS 8';

  it('answers with the steel nut no recognized attribute would admit', () => {
    const baseline = new LexicalOnlyMatcher(buildIndex(core.catalog.active()), core.config);

    expect(compatibleSet(parseQuery(query).spec, core.catalog.active())).toHaveLength(0);
    expect(baseline.match({ query }).results.map((match) => match.sku)).toEqual([
      'PXNUT1216STZC0005',
      'PXLOCK1212BRZC0253',
      'PXLOCK346BRPL0170',
    ]);
  });

  it('recovers that SKU through runBaseline, which a filtered pool could not', () => {
    const cases: EvalCase[] = [
      {
        id: 'pin-baseline',
        query,
        expectedStatus: 'ambiguous',
        expected: ['PXNUT1216STZC0005'],
        tags: [],
      },
    ];

    expect(runBaseline({ catalog: core.catalog, cases }).setRecovery).toMatchObject({
      cases: 1,
      recall: 1,
      precision: 1,
    });
  });
});
