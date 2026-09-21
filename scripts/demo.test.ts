import { describe, expect, it } from 'vitest';

import { createCore } from '../packages/core/src/application/createCore';
import { DEMO_STEPS, render, transcript } from './demo';

const core = createCore({ dataDir: new URL('../data', import.meta.url).pathname });

const step = (title: string): (typeof DEMO_STEPS)[number] => {
  const found = DEMO_STEPS.find((entry) => entry.title === title);
  if (found === undefined) throw new Error(`no demo step titled "${title}"`);

  return found;
};

const bodyOf = (title: string): string => render(core, step(title)).join('\n');

describe('the scripted demo', () => {
  // docs/DESIGN.md 14 names the beats; a step dropped from the script is a step the
  // rehearsal stops covering, so the list itself is asserted rather than its length.
  it('covers every beat docs/DESIGN.md 14 asks for', () => {
    expect(DEMO_STEPS.map((entry) => entry.title)).toEqual([
      'Fully specified',
      'Missing attributes',
      'Strong profile',
      'Profile the catalog cannot honour',
      'Sparse and conflicting history',
      'An explicit standard beats the history',
      'The query contradicts the history',
      'A discontinued purchase',
      'A length the catalog does not stock',
      'A diameter the catalog does not have',
      'A history reference with no customer',
      'The same reference, with a customer',
      'The reference with an override',
      'One it gets wrong',
    ]);
  });

  it('names a customer only where the beat is about one', () => {
    expect(step('Missing attributes').customerId).toBeUndefined();
    expect(step('Strong profile').customerId).toBe('CUST-002');
  });
});

describe('what each beat puts on screen', () => {
  it('resolves the fully specified query to its one SKU', () => {
    expect(bodyOf('Fully specified')).toContain('PXHEX1434STZC0003');
    expect(bodyOf('Fully specified')).toContain('unique');
  });

  it('shows the seven options and what would settle them', () => {
    const body = bodyOf('Missing attributes');

    expect(body).toContain('7 compatible options');
    expect(body).toContain('material');
  });

  it('puts the repeat purchase first once the customer is known', () => {
    const body = bodyOf('Strong profile');

    expect(body).toContain('PXWASH88088PL0688');
    expect(body).toContain('bought 2x');
  });

  it('keeps the compatible count where personalization found it', () => {
    expect(bodyOf('Strong profile')).toContain('7 compatible options');
  });

  it('lets the named standard beat what the customer keeps buying', () => {
    const body = bodyOf('An explicit standard beats the history');

    expect(body).toContain('PXWASH816A2BO0624');
    expect(body).not.toContain('PXWASH88088PL0688');
  });

  it('answers brass only where the query overrode the history', () => {
    expect(bodyOf('The query contradicts the history')).toContain('overridden by the query');
  });

  it('names the discontinued purchase instead of hiding it', () => {
    expect(bodyOf('A discontinued purchase')).toContain('discontinued');
  });

  // Matched on the rendered figure rather than the word: the narration of these two beats
  // says "relaxed" and "closeness" as well, and would satisfy a bare substring either way.
  const ALTERNATIVE = /closeness \d+%.+relaxed/;

  it('names the failed constraint and offers the nearest lengths', () => {
    const body = bodyOf('A length the catalog does not stock');

    expect(body).toContain('no M8 socket head cap screw at 45 mm');
    expect(body).toMatch(ALTERNATIVE);
  });

  it('offers nothing at all for a diameter the catalog does not have', () => {
    const body = bodyOf('A diameter the catalog does not have');

    expect(body).toContain('M14 is not a diameter in this catalog');
    expect(body).not.toMatch(ALTERNATIVE);
  });

  it('asks for a customer before it resolves a reference', () => {
    expect(bodyOf('A history reference with no customer')).toContain('select a customer');
  });

  it('shows the orders themselves once a customer is chosen', () => {
    expect(bodyOf('The same reference, with a customer')).toContain('ordered');
  });

  it('carries the referenced order into the override', () => {
    expect(bodyOf('The reference with an override')).toContain('based on your');
  });

  // The beat DESIGN 14 asks for by name: one case the system gets wrong, with the fix.
  it('shows a real miss and says what would fix it', () => {
    const wrong = step('One it gets wrong');

    expect(wrong.expectation).toMatch(/set screw/);
    expect(bodyOf('One it gets wrong')).toContain('ambiguous');
  });
});

describe('the transcript', () => {
  it('runs every step and heads each with its title', () => {
    const lines = transcript(core);

    for (const entry of DEMO_STEPS) expect(lines).toContain(`## ${entry.title}`);
  });

  it('is the same transcript twice, because nothing here reads the clock', () => {
    expect(transcript(core)).toEqual(transcript(core));
  });
});
