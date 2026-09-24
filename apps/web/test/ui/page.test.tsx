import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HomePage from '../../app/page';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it('composes the results panel and nothing of its own', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Catalog Match' })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /query/i })).toBeDefined();
    expect(screen.getByRole('combobox', { name: /customer/i })).toBeDefined();
  });

  it('has dropped the scaffold placeholder', () => {
    render(<HomePage />);

    expect(screen.queryByText(/scaffold placeholder/i)).toBeNull();
  });
});

// docs/DESIGN.md 5.5 asks for the semantics on the page as well as in the README, and 12
// makes it the mitigation for reading the number as a calibrated probability. The redesign
// moved this text off the page and into a dialog opened from the header.
describe('what the confidence dialog explains', () => {
  it('states the semantics once opened from the header', async () => {
    render(<HomePage />);

    await userEvent.click(screen.getByRole('button', { name: /how it works/i }));
    const text = screen.getByRole('dialog', { name: /confidence/i }).textContent ?? '';

    expect(text).toMatch(/estimate that this SKU is the intended one/i);
    expect(text).toMatch(/not a measured frequency/i);
    // The ceiling is 1 - epsilon, so a reader who sees 98% on an exact match needs the page
    // to account for the rest rather than leave it unexplained.
    expect(text).toMatch(/never reaches 100%/i);
    expect(text).toMatch(/not in this catalog/i);
  });

  // The numbers behind the bands stay out of the page on purpose: every threshold lives in
  // matching/config.ts, and src/** may not import core runtime code to read one.
  it('says a label is a band set after measurement, not a promise', async () => {
    render(<HomePage />);

    await userEvent.click(screen.getByRole('button', { name: /how it works/i }));
    const text = screen.getByRole('dialog', { name: /confidence/i }).textContent ?? '';

    expect(text).toMatch(/High, Medium and Low/);
    expect(text).toMatch(/after the calibration measurement/i);
    expect(text).not.toMatch(/0\.\d/);
  });
});
