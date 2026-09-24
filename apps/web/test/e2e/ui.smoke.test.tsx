import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('fills a unique answer to three cards, the near misses under their own heading', async () => {
    render(<HomePage />);

    await userEvent.type(screen.getByRole('textbox', { name: /query/i }), 'M8 flat washer DIN 912');
    await userEvent.click(screen.getByRole('button', { name: 'Match catalog' }));

    const matches = await screen.findByRole('region', { name: 'Matches' });
    const alternatives = screen.getByRole('region', { name: 'Alternatives' });

    expect(within(matches).getAllByRole('article')).toHaveLength(1);
    expect(within(alternatives).getAllByRole('article')).toHaveLength(2);
    expect(within(alternatives).getAllByText(/relaxed: standard/)).toHaveLength(2);
  });

  it('says a set is tied and reveals the whole of it on request', async () => {
    render(<HomePage />);

    await userEvent.type(screen.getByRole('textbox', { name: /query/i }), 'M8 flat washer');
    await userEvent.click(screen.getByRole('button', { name: 'Match catalog' }));

    expect(await screen.findByText('7 compatible items')).toBeDefined();
    expect(
      screen.getByText('all 7 compatible items score the same; the order shown is by SKU'),
    ).toBeDefined();

    const matches = screen.getByRole('region', { name: 'Matches' });
    expect(within(matches).getAllByRole('article')).toHaveLength(3);

    await userEvent.click(screen.getByRole('button', { name: 'Show all 7' }));

    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: 'Matches' })).getAllByRole('article'),
      ).toHaveLength(7);
    });
    expect(screen.queryByRole('button', { name: 'Show all 7' })).toBeNull();
  });

  it('answers a length the catalog does not stock with the note and the alternatives', async () => {
    render(<HomePage />);

    await userEvent.type(screen.getByRole('textbox', { name: /query/i }), 'M8 x 45mm SHCS');
    await userEvent.click(screen.getByRole('button', { name: 'Match catalog' }));

    expect(await screen.findByText('no M8 socket head cap screw at 45 mm')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'No compatible items' })).toBeDefined();

    const alternatives = await screen.findByRole('region', { name: 'Alternatives' });

    expect(within(alternatives).getAllByRole('article')).toHaveLength(3);
    expect(screen.queryByRole('region', { name: 'Matches' })).toBeNull();
  });

  it('answers a diameter the catalog does not carry with no invented alternative', async () => {
    render(<HomePage />);

    await userEvent.type(screen.getByRole('textbox', { name: /query/i }), 'M14 hex nut');
    await userEvent.click(screen.getByRole('button', { name: 'Match catalog' }));

    expect(screen.getByRole('heading', { name: 'No compatible items' })).toBeDefined();
    expect(await screen.findByText('M14 is not a diameter in this catalog')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Alternatives' })).toBeNull();
    expect(screen.queryByText(/M10|M12|M16/)).toBeNull();
  });
});
