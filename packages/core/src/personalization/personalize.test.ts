import { describe, expect, it } from 'vitest';

import { FINISHES, MATERIALS, THREAD_SYSTEMS } from '../domain/attributes';
import type { CatalogItem, CustomerProfile } from '../domain/catalog';
import type { PersonalizationExplanation } from '../domain/match';
import type { ParsedSpec } from '../domain/spec';
import { DEFAULT_MATCHER_CONFIG as config } from '../matching/config';
import { descriptionParser } from '../parsing/descriptionParser';
import { queryParser } from '../parsing/queryParser';
import { historyPrior } from './historyPrior';
import { personalize } from './personalize';

function item(sku: string, description: string, active = true): CatalogItem {
  return { catalogId: sku, sku, description, active, spec: descriptionParser.parse(description) };
}

const evenly = (values: readonly string[]): Record<string, number> =>
  Object.fromEntries(values.map((value) => [value, 1 / values.length]));

/** A share of 1 for `value` and 0 for every other value of the attribute, so a test names
 * the customer's preference without having to arrange a history that produces it. */
const only = (values: readonly string[], value: string): Record<string, number> =>
  Object.fromEntries(values.map((entry) => [entry, entry === value ? 1 : 0]));

function profileOf(overrides: Partial<CustomerProfile> = {}): CustomerProfile {
  return {
    customerId: 'A',
    customerName: 'A Inc',
    nEff: 5,
    lambda: 0.5,
    referenceDate: '2026-04-25',
    shares: {
      material: evenly(MATERIALS),
      finish: evenly(FINISHES),
      threadSystem: evenly(THREAD_SYSTEMS),
    },
    repeats: {},
    purchases: {},
    discontinued: [],
    warnings: [],
    ...overrides,
  };
}

function explain(
  profile: CustomerProfile,
  spec: ParsedSpec,
  candidates: readonly CatalogItem[],
  sku: string,
): PersonalizationExplanation {
  const found = personalize(
    profile,
    spec,
    candidates,
    historyPrior(profile, spec, candidates, config),
  ).get(sku);
  if (found === undefined) throw new Error(`no personalization for ${sku}`);

  return found;
}

const M8_WASHER = queryParser.parse('M8 flat washer');
const STAINLESS_M8_WASHER = queryParser.parse('stainless M8 washer');
const BRASS_NUT = queryParser.parse('brass hex nut 1/2-13');
const ZINC_NUT = queryParser.parse('zinc hex nut 1/2-13');
const M16_NUT = queryParser.parse('M16 hex nut');

const WASHERS = [
  item('SS', 'M8-1.25 FLAT WASHER ISO 7380 18-8 SS PLAIN'),
  item('BO', 'M8-1.25 FLAT WSHR DIN 912 A2 SS BLACK OXIDE'),
];

const BRASS_NUTS = [
  item('N1', '1/2-13 HEX NUT ISO 7380 BRASS ZINC'),
  item('N2', '1/2-13 HEX NUT DIN 933 BRASS ZINC'),
];

const YELLOW_ZINC_NUTS = [item('YZ', '1/2-13 HEX NUT DIN 933 STEEL YELLOW ZINC')];

const M16_NUTS = [
  item('A2', 'M16-2.0 HEX NUT ASTM A307 A2 SS HDG'),
  item('ST', 'M16-2.0 HEX NUT STEEL ZINC'),
];

const RETIRED = item('OLD', 'M16-2.0 HEX NUT IFI 111 18-8 SS PLAIN', false);

describe('the reason a match carries', () => {
  it('counts the purchases of a SKU the customer has bought', () => {
    const profile = profileOf({
      repeats: { SS: 1 },
      purchases: {
        SS: { count: 2, lastOrderDate: '2026-04-15', spec: WASHERS[0]?.spec ?? M8_WASHER },
      },
    });

    expect(explain(profile, M8_WASHER, WASHERS, 'SS').reason).toBe('bought 2x, last 2026-04-15');
  });

  it('names the discontinued SKU an active item inherited weight from', () => {
    const profile = profileOf({
      discontinued: ['OLD'],
      purchases: {
        OLD: { count: 1, lastOrderDate: '2025-12-02', spec: RETIRED.spec },
      },
    });

    expect(explain(profile, M16_NUT, M16_NUTS, 'A2').reason).toBe(
      'shares diameter, type and material family with OLD',
    );
  });

  it('states the preference when the customer has neither bought nor lost the item', () => {
    const profile = profileOf({
      shares: {
        material: only(MATERIALS, 'ss_18_8'),
        finish: only(FINISHES, 'plain'),
        threadSystem: evenly(THREAD_SYSTEMS),
      },
    });

    expect(explain(profile, M8_WASHER, WASHERS, 'SS').reason).toBe('history prefers 18-8 SS plain');
  });

  it('says which attribute the compatible set could not honour', () => {
    const profile = profileOf({
      shares: {
        material: only(MATERIALS, 'alloy'),
        finish: only(FINISHES, 'black_oxide'),
        threadSystem: evenly(THREAD_SYSTEMS),
      },
    });

    expect(explain(profile, M8_WASHER, WASHERS, 'BO').reason).toBe(
      'no alloy in the compatible set; material could not be matched',
    );
  });

  it('prefers the override to every other reason, including a repeat purchase', () => {
    const profile = profileOf({
      shares: {
        material: only(MATERIALS, 'alloy'),
        finish: only(FINISHES, 'black_oxide'),
        threadSystem: evenly(THREAD_SYSTEMS),
      },
      repeats: { N1: 1 },
      purchases: {
        N1: { count: 3, lastOrderDate: '2026-01-10', spec: BRASS_NUTS[0]?.spec ?? BRASS_NUT },
      },
    });

    expect(explain(profile, BRASS_NUT, BRASS_NUTS, 'N1').reason).toBe(
      'history prefers alloy black oxide; overridden by the query',
    );
  });
});

describe('the attributes the query overrode', () => {
  const preferring = (material: string, finish: string): CustomerProfile =>
    profileOf({
      shares: {
        material: only(MATERIALS, material),
        finish: only(FINISHES, finish),
        threadSystem: evenly(THREAD_SYSTEMS),
      },
    });

  it('lists a stated attribute whose value the history does not prefer', () => {
    expect(
      explain(preferring('alloy', 'black_oxide'), BRASS_NUT, BRASS_NUTS, 'N1').overriddenBy,
    ).toEqual(['material']);
  });

  it('lists nothing when the stated value is the one the history prefers', () => {
    expect(
      explain(preferring('brass', 'black_oxide'), BRASS_NUT, BRASS_NUTS, 'N1').overriddenBy,
    ).toBeUndefined();
  });

  it('never lists an attribute the query left unstated', () => {
    const explanation = explain(preferring('alloy', 'black_oxide'), M8_WASHER, WASHERS, 'BO');

    expect(explanation.overriddenBy).toBeUndefined();
  });
});

describe('a stated family that agrees with the preferred member', () => {
  it('does not report the material as overridden when the query states its family', () => {
    const profile = profileOf({
      shares: {
        material: only(MATERIALS, 'ss_18_8'),
        finish: only(FINISHES, 'plain'),
        threadSystem: evenly(THREAD_SYSTEMS),
      },
    });

    const explanation = explain(profile, STAINLESS_M8_WASHER, WASHERS, 'SS');

    expect(explanation.reason).toBe('history prefers 18-8 SS plain');
    expect(explanation.overriddenBy).toBeUndefined();
  });

  it('holds for every compatible item, not only the top result', () => {
    const profile = profileOf({
      shares: {
        material: only(MATERIALS, 'ss_18_8'),
        finish: only(FINISHES, 'plain'),
        threadSystem: evenly(THREAD_SYSTEMS),
      },
    });

    for (const sku of ['SS', 'BO']) {
      const overriddenBy = explain(profile, STAINLESS_M8_WASHER, WASHERS, sku).overriddenBy;
      expect(overriddenBy).toBeUndefined();
    }
  });

  it('does not report the finish as overridden when the query states a sibling in the same family', () => {
    const profile = profileOf({
      shares: {
        material: only(MATERIALS, 'steel'),
        finish: only(FINISHES, 'yellow_zinc'),
        threadSystem: evenly(THREAD_SYSTEMS),
      },
    });

    const explanation = explain(profile, ZINC_NUT, YELLOW_ZINC_NUTS, 'YZ');

    expect(explanation.reason).toBe('history prefers steel yellow zinc');
    expect(explanation.overriddenBy).toBeUndefined();
  });

  it('still reports an override when the stated family differs from the preferred one', () => {
    const profile = profileOf({
      shares: {
        material: only(MATERIALS, 'alloy'),
        finish: only(FINISHES, 'black_oxide'),
        threadSystem: evenly(THREAD_SYSTEMS),
      },
    });

    const explanation = explain(profile, BRASS_NUT, BRASS_NUTS, 'N1');

    expect(explanation.reason).toBe('history prefers alloy black oxide; overridden by the query');
    expect(explanation.overriddenBy).toEqual(['material']);
  });
});

describe('the prior a match reports', () => {
  it('is the q the history prior gave that item', () => {
    const profile = profileOf({
      shares: {
        material: only(MATERIALS, 'ss_18_8'),
        finish: only(FINISHES, 'plain'),
        threadSystem: evenly(THREAD_SYSTEMS),
      },
    });
    const { q } = historyPrior(profile, M8_WASHER, WASHERS, config);

    expect(explain(profile, M8_WASHER, WASHERS, 'SS').prior).toBe(q.get('SS'));
  });

  it('explains every compatible item, so no result is left without one', () => {
    const explanations = personalize(
      profileOf(),
      M8_WASHER,
      WASHERS,
      historyPrior(profileOf(), M8_WASHER, WASHERS, config),
    );

    expect([...explanations.keys()].toSorted()).toEqual(['BO', 'SS']);
  });
});

describe('a profile with nothing to say', () => {
  const silent = profileOf({
    shares: { material: {}, finish: {}, threadSystem: {} },
  });

  it('leaves an item unexplained rather than inventing a preference', () => {
    const explanations = personalize(
      silent,
      M8_WASHER,
      WASHERS,
      historyPrior(silent, M8_WASHER, WASHERS, config),
    );

    expect(explanations.size).toBe(0);
  });

  it('still reports a purchase, which needs no preference to state', () => {
    const bought = profileOf({
      shares: { material: {}, finish: {}, threadSystem: {} },
      repeats: { SS: 1 },
      purchases: {
        SS: { count: 4, lastOrderDate: '2025-09-28', spec: WASHERS[0]?.spec ?? M8_WASHER },
      },
    });

    expect(explain(bought, M8_WASHER, WASHERS, 'SS').reason).toBe('bought 4x, last 2025-09-28');
  });
});

describe('the value a tie in the shares picks', () => {
  it('takes the first in code-unit order, so the choice never depends on the locale', () => {
    const profile = profileOf({
      shares: {
        material: { brass: 0.5, alloy: 0.5 },
        finish: only(FINISHES, 'zinc'),
        threadSystem: evenly(THREAD_SYSTEMS),
      },
    });

    expect(explain(profile, M8_WASHER, WASHERS, 'SS').reason).toBe(
      'no alloy in the compatible set; material could not be matched',
    );
  });
});
