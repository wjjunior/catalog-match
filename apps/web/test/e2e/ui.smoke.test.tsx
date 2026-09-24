import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../../app/api/customers/route';
import { POST } from '../../app/api/match/route';
import HomePage from '../../app/page';

// Only the transport is replaced: the page reaches the real handlers, the real validation
// and the real core.
beforeEach(() => {
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');

    if (url.pathname === '/api/match')
      return await POST(new Request(url, { ...init, method: 'POST' }));
    if (url.pathname === '/api/customers') return GET(new Request(url));

    throw new Error(`unexpected fetch to ${url.pathname}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the page against the real core', () => {
  it('answers an example chip with a status line and cards', async () => {
    render(<HomePage />);

    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '1/4-20 x 3/4 hex cap screw zinc',
      }),
    );

    const matches = await screen.findByRole('region', { name: 'Matches' });
    const cards = within(matches).getAllByRole('article');

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(3);
    expect(screen.getByRole('status').textContent).not.toBe('');
    expect(within(matches).getByText('PXHEX1434STZC0003')).toBeDefined();
  });

  it('answers a length the catalog does not stock with the note and the alternatives', async () => {
    render(<HomePage />);

    await userEvent.type(screen.getByRole('textbox', { name: /query/i }), 'M8 x 45mm SHCS');
    await userEvent.click(screen.getByRole('button', { name: 'Match catalog' }));

    expect(await screen.findByText('no M8 socket head cap screw at 45 mm')).toBeDefined();

    const alternatives = await screen.findByRole('region', { name: 'Alternatives' });

    expect(within(alternatives).getAllByRole('article')).toHaveLength(3);
    expect(screen.queryByRole('region', { name: 'Matches' })).toBeNull();
  });
});
