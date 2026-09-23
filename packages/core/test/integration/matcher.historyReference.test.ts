import { describe, expect, it } from 'vitest';

import { InMemoryCatalogRepository } from '../../src/adapters/memory/inMemoryCatalogRepository';
import { InMemoryOrderHistoryRepository } from '../../src/adapters/memory/inMemoryOrderHistoryRepository';
import { createCoreFromRepositories } from '../../src/application/createCore';
import type { Core } from '../../src/application/createCore';
import type { CatalogItem, HistoryLine } from '../../src/domain/catalog';
import type { MatchResponse } from '../../src/domain/match';
import { compatibleSet } from '../../src/matching/compatibility';
import { descriptionParser } from '../../src/parsing/descriptionParser';
import { parseQuery } from '../../src/parsing/queryParser';
import { detectIntent, INTENT_PHRASES } from '../../src/personalization';
import { core as liveCore } from './setup';

const CUSTOMER = 'CUST-001';

const item = (sku: string, description: string): CatalogItem => ({
  catalogId: sku,
  sku,
  description,
  active: true,
  spec: descriptionParser.parse(description),
});

const SCREW_50 = item('SOC50', 'M8-1.25 X 50MM SOCKET HEAD CAP SCREW DIN 912 18-8 SS PLAIN');
const SCREW_40 = item('SOC40', 'M8-1.25 X 40MM SOCKET HEAD CAP SCREW DIN 912 18-8 SS PLAIN');
const NUT = item('NUT', 'M8-1.25 HEX NUT DIN 934 18-8 SS PLAIN');

const ordered = (entry: CatalogItem): HistoryLine => ({
  customerId: CUSTOMER,
  customerName: 'Midwest Industrial Supply',
  orderDate: '2026-04-15',
  sku: entry.sku,
  description: entry.description,
  quantity: 10,
});

const over = (history: CatalogItem): Core =>
  createCoreFromRepositories({
    catalog: new InMemoryCatalogRepository([SCREW_50, SCREW_40, NUT]),
    history: new InMemoryOrderHistoryRepository([ordered(history)]),
  });

/** The two references the query cannot tell apart: both name past orders, only one of
 * them names an order the query's selectors reach. */
const FIXTURES = [
  { reference: 'names a past order', core: over(SCREW_50) },
  { reference: 'names no past order', core: over(NUT) },
];

/** Each value is satisfiable against SCREW_50 and SCREW_40; each counter-value is
 * absent from the catalog, and is the value the note has to name. */
const AXES = [
  { attr: 'material', satisfied: 'in 18-8 SS', unmet: 'in brass', named: 'brass' },
  { attr: 'finish', satisfied: 'in plain', unmet: 'in black oxide', named: 'black oxide' },
  { attr: 'standard', satisfied: 'DIN 912', unmet: 'DIN 933', named: 'DIN 933' },
  { attr: 'length', satisfied: 'x 50mm', unmet: 'x 75mm', named: '75 mm' },
];

const ask = (core: Core, query: string): MatchResponse =>
  core.matchQuery({ query, customerId: CUSTOMER });

/** The repo's own compatible set over what the query itself stated: a result outside it
 * is a result the stated attributes excluded. */
function contradicting(core: Core, response: MatchResponse): string[] {
  const admitted = new Set(
    compatibleSet(response.parsed, core.catalog.active()).map((entry) => entry.sku),
  );

  return response.results.map((match) => match.sku).filter((sku) => !admitted.has(sku));
}

const messages = (response: MatchResponse): string =>
  response.notes.map((n) => n.message).join(' || ');

describe.each(FIXTURES)('a history reference that $reference', ({ core }) => {
  describe.each(AXES)('with a stated $attr', ({ satisfied, unmet, named }) => {
    it.each(INTENT_PHRASES)(
      `constrains the results the catalog satisfies, after '%s'`,
      (phrase) => {
        const query = `${phrase} M8 socket head cap screw ${satisfied}`;
        expect(detectIntent(parseQuery(query).intentCandidates).phrase).toBe(phrase);

        const response = ask(core, query);

        expect(response.results.length).toBeGreaterThan(0);
        expect(contradicting(core, response)).toEqual([]);
      },
    );

    it.each(INTENT_PHRASES)(`is named when the catalog cannot satisfy it, after '%s'`, (phrase) => {
      const query = `${phrase} M8 socket head cap screw ${unmet}`;
      expect(detectIntent(parseQuery(query).intentCandidates).phrase).toBe(phrase);

      const response = ask(core, query);

      expect(response.results).toEqual([]);
      expect(messages(response)).toContain(named);
    });
  });

  it.each(INTENT_PHRASES)(`never answers history with nothing, after '%s'`, (phrase) => {
    for (const { satisfied, unmet } of AXES) {
      for (const stated of [satisfied, unmet]) {
        const response = ask(core, `${phrase} M8 socket head cap screw ${stated}`);

        expect({
          stated,
          mute: response.status === 'history' && response.results.length === 0,
        }).toEqual({ stated, mute: false });
      }
    }
  });
});

describe('a history reference the customer has no order for', () => {
  const core = over(NUT);

  it('does not claim the catalog lacks what the catalog stocks', () => {
    const response = ask(core, 'same M8 socket head cap screw');

    expect(compatibleSet(response.parsed, core.catalog.active()).map((i) => i.sku)).toEqual([
      'SOC40',
      'SOC50',
    ]);
    expect(response.results.map((match) => match.sku)).toEqual(['SOC40', 'SOC50']);
    expect(messages(response)).not.toContain('no M8 socket head cap screw');
  });

  it('says the history named no order rather than blaming the catalog', () => {
    const response = ask(core, 'same M8 socket head cap screw');

    expect(response.notes).toContainEqual({
      code: 'historyReference',
      message: "no earlier order matches 'same'",
    });
  });

  it('still takes the backoff when the stated attribute is the one that fails', () => {
    const response = ask(core, 'same M8 socket head cap screw x 75mm');

    expect(response.status).toBe('none');
    expect(response.alternatives.map((alternative) => alternative.sku)).toEqual(['SOC50', 'SOC40']);
  });
});

describe('a reference the parser can place no line of', () => {
  const unreadable = createCoreFromRepositories({
    catalog: new InMemoryCatalogRepository([SCREW_50, SCREW_40, NUT]),
    history: new InMemoryOrderHistoryRepository([
      { ...ordered(NUT), sku: 'ZZZ', description: 'XXXX' },
    ]),
  });

  it.each(INTENT_PHRASES)(`says so rather than ranking the catalog, after '%s'`, (phrase) => {
    const response = ask(unreadable, phrase);

    expect(response.results).toEqual([]);
    expect(response.notes).toContainEqual({
      code: 'historyReference',
      message: `no earlier order matches '${phrase}'`,
    });
  });
});

describe('every customer in the delivered history', () => {
  const customers = liveCore.listCustomers().map((customer) => customer.customerId);

  it.each(customers)('is never answered history with nothing (%s)', (customerId) => {
    for (const phrase of INTENT_PHRASES) {
      for (const tail of ['', ' M8 socket head cap screw', ' zinc M8 x 50mm BHCS', ' brass rod']) {
        const query = `${phrase}${tail}`;
        const response = liveCore.matchQuery({ query, customerId });

        expect({
          query,
          mute: response.status === 'history' && response.results.length === 0,
        }).toEqual({ query, mute: false });
      }
    }
  });
});

describe('the reported query, over the delivered data', () => {
  const asked = (query: string): MatchResponse =>
    liveCore.matchQuery({ query, customerId: CUSTOMER });

  it.each(INTENT_PHRASES)(`keeps the failed finish named after '%s'`, (phrase) => {
    const plain = asked('zinc M8 x 50mm BHCS');
    const referenced = asked(`${phrase} zinc M8 x 50mm BHCS`);

    expect(plain.notes).toContainEqual({
      code: 'failedConstraint',
      message: 'no M8 button socket cap screw in zinc',
    });
    expect(referenced.notes).toContainEqual({
      code: 'failedConstraint',
      message: 'no M8 button socket cap screw in zinc',
    });
  });

  it.each(INTENT_PHRASES)(
    `keeps the alternatives an intent phrase used to erase, after '%s'`,
    (phrase) => {
      const plain = asked('zinc M8 x 50mm BHCS');
      const referenced = asked(`${phrase} zinc M8 x 50mm BHCS`);

      expect(referenced.status).toBe(plain.status);
      expect(referenced.alternatives.map((a) => a.sku)).toEqual(
        plain.alternatives.map((a) => a.sku),
      );
    },
  );
});
