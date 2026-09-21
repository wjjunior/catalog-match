import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Core } from '../packages/core/src/application/createCore';
import { createCore } from '../packages/core/src/application/createCore';
import type { MatchResponse } from '../packages/core/src/domain/match';

// A fourth driving adapter over the Matcher port, beside the route handlers, the eval
// harness and the property tests. docs/DESIGN.md 4.2 and 14.
const ROOT = new URL('../', import.meta.url);

export interface DemoStep {
  readonly title: string;
  readonly query: string;
  readonly customerId?: string;
  /** What the room should be looking at while this is on screen. */
  readonly expectation: string;
  readonly limit?: number;
}

/** The beats of docs/DESIGN.md 14, in the order they are performed. */
export const DEMO_STEPS: readonly DemoStep[] = [
  {
    title: 'Fully specified',
    query: '1/4-20 x 3/4 hex cap screw zinc',
    expectation: 'Every attribute agrees on one SKU, so the status is unique before any number.',
  },
  {
    title: 'Missing attributes',
    query: 'M8 flat washer',
    limit: 7,
    expectation:
      'Seven compatible washers differing only in material, finish and standard. Nothing in the query separates them, so they share a confidence and the status line says what would settle it.',
  },
  {
    title: 'Strong profile',
    query: 'M8 flat washer',
    customerId: 'CUST-002',
    limit: 7,
    expectation:
      'Same seven. CleanRoom Pharma is 17 of 17 lines 18-8 SS plain and bought this washer twice, so the prior moves it to the top with the reason on the card.',
  },
  {
    title: 'Profile the catalog cannot honour',
    query: 'M8 flat washer',
    customerId: 'CUST-004',
    limit: 7,
    expectation:
      'No M8 flat washer is alloy, so the material term drops out and only the finish share acts. A narrower margin, and the card says the material could not be matched.',
  },
  {
    title: 'Sparse and conflicting history',
    query: 'M8 flat washer',
    customerId: 'CUST-005',
    limit: 7,
    expectation:
      'Six lines across four materials. Shrinkage keeps the prior near uniform: the top is a lead, not a separation. The sparse case is meant to look like this.',
  },
  {
    title: 'An explicit standard beats the history',
    query: 'M8 flat washer DIN 912',
    customerId: 'CUST-002',
    expectation:
      'A named standard is a constraint like any other, so C has one item. The ISO 7380 washer this customer bought twice is outside C and cannot be ranked into it. The guarantee is structural, not a weight.',
  },
  {
    title: 'The query contradicts the history',
    query: 'brass hex nut 1/2-13',
    customerId: 'CUST-004',
    expectation:
      'Heavy Machinery buys alloy black oxide and nothing else. Brass only comes back, and the card records the override instead of hiding it.',
  },
  {
    title: 'A discontinued purchase',
    query: 'M16 hex nut',
    customerId: 'CUST-002',
    expectation:
      'The M16 nut this customer bought is no longer active. It is excluded from C and named in a note, and the stainless-family nuts inherit part of its weight.',
  },
  {
    title: 'A length the catalog does not stock',
    query: 'M8 x 45mm SHCS',
    expectation:
      'Eight M8 socket head cap screws, none at 45 mm. Status none, the failed constraint named, and the nearest lengths offered as alternatives with closeness rather than confidence.',
  },
  {
    title: 'A diameter the catalog does not have',
    query: 'M14 hex nut',
    expectation:
      'Diameter and type are never relaxed, so there is nothing honest to offer. A note and no alternatives.',
  },
  {
    title: 'A history reference with no customer',
    query: 'the same washers as last time',
    expectation: 'No attributes to work with and no customer to resolve the reference against.',
  },
  {
    title: 'The same reference, with a customer',
    query: 'the same washers as last time',
    customerId: 'CUST-002',
    limit: 5,
    expectation:
      'The referenced orders themselves, most recent first, with the date and quantity as the explanation. There is no compatible set behind these: recency is the whole ranking.',
  },
  {
    title: 'The reference with an override',
    query: 'same washers as last time, but brass',
    customerId: 'CUST-002',
    expectation:
      'The referenced line becomes the base specification, the query overwrites the material, and the merged specification runs the normal pipeline.',
  },
  {
    title: 'One it gets wrong',
    query: 'square head set screw M6',
    expectation:
      'Held-out case HO-14. This should be none: the catalog has no set screw. The unstocked-type list carries "square head bolt" and not "set screw", so the phrase falls to the residue, which by design cannot empty C, and only the M6 constrains. The fix is not another lexicon entry — the held-out set exists to stop that — it is the structured extraction of docs/DESIGN.md 13 for queries that end mostly as residue.',
  },
];

const percent = (value: number): string => `${String(Math.round(value * 100))}%`;

function headline(response: MatchResponse): string {
  if (response.status === 'none') return 'no compatible item in this catalog';
  if (response.status === 'unparsed') return 'could not parse that query';
  if (response.compatibleCount === 1) return '1 match';

  return `${String(response.compatibleCount)} compatible options`;
}

function matchLines(response: MatchResponse): string[] {
  return response.results.map((result) => {
    const label = result.label === undefined ? '' : ` ${result.label}`;
    const reason = result.explanation.personalization?.reason;
    const override = result.explanation.personalization?.overriddenBy;

    return [
      `  ${result.sku}  ${percent(result.confidence)}${label}  ${result.description}`,
      reason === undefined ? '' : `\n      ↳ ${reason}`,
      override === undefined || override.length === 0
        ? ''
        : `, overridden by ${override.join(', ')}`,
    ].join('');
  });
}

function alternativeLines(response: MatchResponse): string[] {
  return response.alternatives.map(
    (option) =>
      `  ${option.sku}  closeness ${percent(option.closeness)}  relaxed ${option.relaxed.join(', ')}  ${option.description}`,
  );
}

/** One beat, as the lines it puts on screen. Kept separate from printing so the rehearsal
 * is a test rather than a thing someone watches scroll past. */
export function render(core: Core, step: DemoStep): string[] {
  const response = core.matchQuery({
    query: step.query,
    customerId: step.customerId,
    limit: step.limit ?? 3,
  });

  const who = step.customerId === undefined ? 'no customer' : step.customerId;
  const settle = response.results[0]?.explanation.disambiguateBy ?? [];

  return [
    `> ${step.query}   (${who})`,
    '',
    `  status ${response.status} — ${headline(response)}${settle.length === 0 ? '' : `, specify ${settle.join(' or ')}`}`,
    ...(response.results.length === 0 ? [] : ['', ...matchLines(response)]),
    ...(response.alternatives.length === 0 ? [] : ['', ...alternativeLines(response)]),
    ...(response.notes.length === 0 ? [] : ['', ...response.notes.map((n) => `  · ${n.message}`)]),
    '',
    `  ${step.expectation}`,
  ];
}

export function transcript(core: Core): string[] {
  return DEMO_STEPS.flatMap((step) => ['', `## ${step.title}`, '', ...render(core, step)]);
}

function main(): void {
  const core = createCore({ dataDir: fileURLToPath(new URL('data', ROOT)) });

  process.stdout.write(
    ['# Catalog Match — scripted demo', '', 'docs/DEMO.md is the narration for this.']
      .concat(transcript(core))
      .join('\n'),
  );
  process.stdout.write('\n');
}

const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === pathToFileURL(invoked).href) {
  main();
}
