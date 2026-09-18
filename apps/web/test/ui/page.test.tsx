import { render, screen } from '@testing-library/react';
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
