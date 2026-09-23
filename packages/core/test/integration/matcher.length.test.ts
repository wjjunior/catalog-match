import { describe, expect, it } from 'vitest';

import type { MatchResponse } from '../../src/domain/match';
import { lengthBearingTypes } from '../../src/matching/lengthBearing';
import { core } from './setup';

const ask = (query: string): MatchResponse => core.matchQuery({ query });

const skus = (response: MatchResponse): string[] => response.results.map((match) => match.sku);

/** The three phrasings that all reach `spec.length`: a unit, a bare number, and the `x`
 * of ordering shorthand. What separates them is provenance, not the constraint. */
const PHRASINGS = ['60mm', '60', 'x 60'] as const;

/** Named as the note names them, which is how `formatType` writes the parsed value. */
const LENGTHLESS = ['hex nut', 'flat washer', 'lock washer'] as const;

const BEARING = 'socket head cap screw';

describe('the catalog decides which types carry a length', () => {
  it('carries one for seven of the ten product types', () => {
    const bearing = lengthBearingTypes(core.catalog.active());

    expect([...bearing].toSorted()).toEqual([
      'button_socket_cap_screw',
      'hex_cap_screw',
      'lag_screw',
      'pan_machine_screw',
      'socket_head_cap_screw',
      'tap_bolt',
      'threaded_rod',
    ]);
  });

  it('never carries one on a nut or a washer', () => {
    const lengthless = core.catalog
      .active()
      .filter((item) => item.spec.length !== undefined)
      .flatMap((item) => (item.spec.type ?? []).map((entry) => entry.value));

    expect(lengthless).not.toContain('hex_nut');
    expect(lengthless).not.toContain('flat_washer');
    expect(lengthless).not.toContain('lock_washer');
  });
});

describe('a length stated on a type that never carries one', () => {
  for (const type of LENGTHLESS) {
    for (const phrasing of PHRASINGS) {
      const query = `M8 ${type} ${phrasing}`;

      it(`answers ${JSON.stringify(query)} with what "M8 ${type}" answers`, () => {
        const stated = ask(query);
        const plain = ask(`M8 ${type}`);

        expect(stated.status).toBe(plain.status);
        expect(stated.compatibleCount).toBe(plain.compatibleCount);
        expect(skus(stated)).toEqual(skus(plain));
        expect(stated.compatibleCount).toBeGreaterThan(0);
      });

      it(`says a ${type} carries no length for ${JSON.stringify(query)}`, () => {
        expect(ask(query).notes).toContainEqual({
          code: 'unboundLength',
          message: `a ${type} carries no length; 60 mm ignored`,
        });
      });

      it(`never claims the length agreed for ${JSON.stringify(query)}`, () => {
        const matched = ask(query).results.flatMap((match) => match.explanation.matched);

        expect(matched.map((entry) => entry.attr)).not.toContain('length');
      });

      it(`never calls the length a missing detail for ${JSON.stringify(query)}`, () => {
        const unspecified = ask(query).results.flatMap((match) => match.explanation.unspecified);

        expect(unspecified).not.toContain('length');
      });
    }
  }

  it('still reports the length the parser read', () => {
    expect(ask('M8 hex nut x 60').parsed.length).toEqual({ value: 60, unit: 'mm', mm: 60 });
  });

  it('lifts a length when every reading of an ambiguous type is lengthless', () => {
    const response = ask('M8 washer 60mm');

    expect(response.parsed.type?.map((entry) => entry.value)).toEqual([
      'flat_washer',
      'lock_washer',
    ]);
    expect(skus(response)).toEqual(skus(ask('M8 washer')));
  });

  it('reveals the constraint that really failed rather than blaming the length', () => {
    const response = ask('M8 hex nut alloy 60mm');

    expect(response.status).toBe('none');
    expect(response.notes).toContainEqual({
      code: 'failedConstraint',
      message: 'no M8 hex nut in alloy',
    });
    expect(response.notes).toContainEqual({
      code: 'unboundLength',
      message: 'a hex nut carries no length; 60 mm ignored',
    });
  });
});

describe('a length stated on a type that carries one', () => {
  for (const phrasing of PHRASINGS) {
    const query = `M8 ${BEARING} ${phrasing}`;

    it(`still binds for ${JSON.stringify(query)}`, () => {
      const response = ask(query);

      expect(response.status).toBe('unique');
      expect(response.compatibleCount).toBe(1);
      expect(skus(response)).toEqual(['PXSOC860STZC0008']);
      expect(response.notes).toEqual([]);
    });
  }

  it('still fails on a length the catalog does not stock', () => {
    const response = ask(`M8 ${BEARING} 999mm`);

    expect(response.status).toBe('none');
    expect(response.notes).toContainEqual({
      code: 'failedConstraint',
      message: `no M8 ${BEARING} at 999 mm`,
    });
  });

  it('still binds when only one reading of an ambiguous type carries a length', () => {
    const response = ask('M8 hex bolt 60mm');

    expect(response.status).toBe('ambiguous');
    expect(skus(response)).toEqual(['PXHEX860A2PL0680', 'PXTAP860BRPL0369']);
    expect(response.notes).toEqual([]);
  });

  it('still binds when the query names no type at all', () => {
    const response = ask('M8 60mm');

    expect(response.parsed.type).toBeUndefined();
    expect(response.compatibleCount).toBe(5);
    expect(response.notes).toEqual([]);
  });
});
