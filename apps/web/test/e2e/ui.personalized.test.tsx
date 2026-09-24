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

const cards = (): HTMLElement[] =>
  within(screen.getByRole('region', { name: 'Matches' })).getAllByRole('article');

// The headings, not the whole card: the personalization note changes a card's text without
// moving it, and this test is about the order.
const ranked = (): (string | null)[] =>
  cards().map((card) => within(card).getByRole('heading').textContent);

async function selectCustomer(customerId: string): Promise<void> {
  await userEvent.click(screen.getByRole('combobox', { name: /customer/i }));
  await userEvent.click(await screen.findByRole('option', { name: new RegExp(customerId) }));
}

async function ask(query: string): Promise<void> {
  await userEvent.type(screen.getByRole('textbox', { name: /query/i }), query);
  await userEvent.click(screen.getByRole('button', { name: 'Match catalog' }));
}

describe('the page with a customer selected', () => {
  it('re-ranks the matches the moment a customer is chosen', async () => {
    render(<HomePage />);

    await userEvent.click(screen.getByRole('button', { name: 'M8 flat washer' }));
    await screen.findByRole('region', { name: 'Matches' });

    const anonymous = ranked();

    await selectCustomer('CUST-002');
    await userEvent.click(screen.getByRole('button', { name: 'Match catalog' }));

    await waitFor(() => {
      expect(ranked()).not.toEqual(anonymous);
    });
    expect(ranked()[0]).not.toBe(anonymous[0]);
  });

  it('says on the top card why that customer sees it first', async () => {
    render(<HomePage />);

    await selectCustomer('CUST-002');
    await userEvent.click(screen.getByRole('button', { name: 'M8 flat washer' }));

    const reason = await screen.findByText(/bought 2/i);

    expect(cards()[0]?.contains(reason)).toBe(true);
    expect(reason.parentElement?.textContent).toMatch(/prior\s*\d+%/);
  });

  it('renders the note that a previously ordered item is gone', async () => {
    render(<HomePage />);

    await selectCustomer('CUST-002');
    await ask('M16 hex nut');

    const notes = await screen.findByRole('list', { name: 'notes' });

    expect(within(notes).getByText(/is discontinued/i)).toBeDefined();
  });
});

describe('the page without a customer', () => {
  it('asks for one before resolving a history reference', async () => {
    render(<HomePage />);

    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'the same washers as last time',
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe(
        "select a customer to resolve 'last time'",
      );
    });
    expect(screen.queryByRole('region', { name: 'Matches' })).toBeNull();
  });
});
