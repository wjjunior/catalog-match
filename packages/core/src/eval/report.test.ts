import { describe, expect, it } from 'vitest';

import { catalog, caseOf, stubMatcher } from '../../test/eval/fixtures';
import { toJson, toMarkdown } from './report';
import { run } from './run';

const ANSWERS = {
  'M8 flat washer': { skus: ['SS', 'BO', 'BR'], confidences: [0.95, 0.3, 0.2] },
  'M16 hex nut': { skus: ['NUT'], status: 'unique' as const, confidences: [0.42] },
};

const reportOf = (ids: readonly string[]): ReturnType<typeof run> =>
  run({
    matcher: stubMatcher(ANSWERS).matcher,
    catalog,
    cases: ids.map((id) =>
      id === 'u'
        ? caseOf({
            id,
            query: 'M16 hex nut',
            expectedStatus: 'unique',
            expected: ['NUT'],
          })
        : caseOf({ id, expected: ['SS', 'BO', 'BR'] }),
    ),
    clock: (() => {
      let now = 0;
      return () => (now += 7);
    })(),
  });

const golden = { name: 'Golden set', report: reportOf(['a', 'u']) };
const heldout = { name: 'Held-out set', report: reportOf(['h']) };

describe('the markdown report', () => {
  const markdown = toMarkdown([golden, heldout]);

  it('gives each data set its own section', () => {
    expect(markdown).toContain('## Golden set');
    expect(markdown).toContain('## Held-out set');
  });

  it('omits a section that was not run rather than printing an empty one', () => {
    expect(toMarkdown([golden])).not.toContain('Held-out set');
  });

  it('states that the evidence is limited and does not establish generalization', () => {
    expect(markdown).toMatch(/limited evidence/i);
    expect(markdown).toMatch(/generalization/i);
  });

  it('states the circularity of the personalized labels and the mitigations', () => {
    expect(markdown).toMatch(/circular/i);
    expect(markdown).toMatch(/frozen\s+before any parameter was tuned/i);
  });

  it('puts the number of cases behind every metric, not only the totals', () => {
    expect(markdown).toContain('Retrieval of the intended SKU (1 case)');
    expect(markdown).toContain('Recovery of the compatible set (1 case)');
    expect(markdown).toContain('Calibration (1 case)');
  });

  it('gives the margin its own denominator, since it is averaged over fewer cases', () => {
    expect(markdown).toContain('| Mean top-1 to top-2 margin |');
    expect(markdown).toMatch(/\| Mean top-1 to top-2 margin \| [0-9.]+ \| 0 \|/);
  });

  it('renders the confusion matrix over all five statuses, zeros included', () => {
    expect(markdown).toContain(
      '| expected \\ actual | unique | ambiguous | none | history | unparsed |',
    );
    expect(markdown).toMatch(/\| unparsed \| 0 \| 0 \| 0 \| 0 \| 0 \|/);
  });

  it('keeps an empty calibration bin in the table so the gaps are visible', () => {
    expect(markdown).toContain('| 0.5–0.6 | 0 | — |');
  });

  it('formats a rate to three decimals rather than a float tail', () => {
    expect(markdown).toContain('| Hit@1 | 0.000 |');
    expect(markdown).not.toMatch(/0\.\d{5,}/);
  });
});

describe('the JSON summary', () => {
  const summary = toJson([golden, heldout]);

  it('carries the two numbers the CI gate compares', () => {
    expect(summary.sections[0]?.status.accuracy).toBeDefined();
    expect(summary.sections[0]?.constraints.violations).toBe(0);
  });

  it('names each section and its case count', () => {
    expect(summary.sections.map((section) => section.name)).toEqual(['Golden set', 'Held-out set']);
    expect(summary.sections[0]?.cases).toBe(2);
  });

  // Latency is the one number that moves between runs on identical inputs; a gate that
  // compares it would fail on an unrelated machine rather than on a regression.
  it('leaves latency out, so a committed summary does not churn', () => {
    expect(JSON.stringify(summary)).not.toContain('latency');
  });

  it('rounds every rate, so the same inputs serialize to the same bytes', () => {
    expect(JSON.stringify(summary)).not.toMatch(/\d\.\d{6,}/);
  });
});

describe('the personalization table', () => {
  const personalized = toMarkdown([
    {
      name: 'Golden set',
      report: run({
        matcher: stubMatcher(ANSWERS).matcher,
        catalog,
        cases: [
          caseOf({
            id: 'p-1',
            customerId: 'CUST-001',
            expected: ['SS', 'BO', 'BR'],
            expectedTop1: 'SS',
          }),
          caseOf({
            id: 'p-2',
            customerId: 'CUST-002',
            query: 'M16 hex nut',
            expectedStatus: 'unique',
            expected: ['NUT'],
          }),
        ],
      }),
    },
  ]);

  it('counts every personalized case behind Hit@1', () => {
    expect(personalized).toMatch(/\| Hit@1 with the customer \| [0-9.]+ \| 2 \|/);
  });

  // The second case is answered with one result, so it has no top-2 to measure against.
  it('counts only the cases the margin could be measured on', () => {
    expect(personalized).toMatch(/\| Mean top-1 to top-2 margin \| [0-9.]+ \| 1 \|/);
  });
});
