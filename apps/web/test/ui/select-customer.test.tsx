import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomerCombobox } from '../../src/features/select-customer/CustomerCombobox';
import type { CustomerSummary } from '../../src/shared/api/client';
import { customer } from './fixtures';

const CUSTOMERS = [
  customer({ customerId: 'CUST-001', customerName: 'Midwest Industrial Supply', orderCount: 12 }),
  customer({ customerId: 'CUST-002', customerName: 'CleanRoom Pharma MFG', orderCount: 9 }),
  customer({ customerId: 'CUST-003', customerName: 'Marine Electrical Corp', orderCount: 7 }),
];

let fetchMock: ReturnType<typeof vi.fn>;

function serve(customers: CustomerSummary[]) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(customers), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

function lastQuery(): string | undefined {
  const calls = fetchMock.mock.calls;
  return calls.at(-1)?.[0] as string | undefined;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  serve(CUSTOMERS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CustomerCombobox', () => {
  it('is a labelled combobox', () => {
    render(<CustomerCombobox onSelect={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: /customer/i })).toBeDefined();
  });

  it('opens on focus and offers the customers the route returned', async () => {
    render(<CustomerCombobox onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('combobox', { name: /customer/i }));

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]?.textContent).toContain('Midwest Industrial Supply');
    expect(options[0]?.textContent).toContain('CUST-001');
    expect(options[0]?.textContent).toContain('12 orders');
  });

  it('asks the route to filter rather than filtering in the browser', async () => {
    render(<CustomerCombobox onSelect={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox', { name: /customer/i }), 'marine');

    await waitFor(() => {
      expect(lastQuery()).toBe('/api/customers?q=marine');
    });
  });

  it('opens with the first customer the route returned already active', async () => {
    const onSelect = vi.fn();
    render(<CustomerCombobox onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: /customer/i });

    await userEvent.click(input);
    await screen.findAllByRole('option');
    await userEvent.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'CUST-001' }) as unknown as CustomerSummary,
    );
    expect((input as HTMLInputElement).value).toBe('Midwest Industrial Supply');
  });

  it('walks the list with the arrow keys', async () => {
    render(<CustomerCombobox onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('combobox', { name: /customer/i }));
    const options = await screen.findAllByRole('option');
    const active = () =>
      options.findIndex((option) => option.getAttribute('aria-selected') === 'true');

    await userEvent.keyboard('{ArrowDown}');
    const moved = active();

    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe(moved + 1);

    await userEvent.keyboard('{ArrowUp}');
    expect(active()).toBe(moved);
  });

  it('selects the active customer with Enter and closes the list', async () => {
    const onSelect = vi.fn();
    render(<CustomerCombobox onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: /customer/i });

    await userEvent.click(input);
    await screen.findAllByRole('option');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'CUST-003' }) as unknown as CustomerSummary,
    );
    expect((input as HTMLInputElement).value).toBe('Marine Electrical Corp');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('selects on click too', async () => {
    const onSelect = vi.fn();
    render(<CustomerCombobox onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('combobox', { name: /customer/i }));
    const options = await screen.findAllByRole('option');
    await userEvent.click(options[1] as HTMLElement);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'CUST-002' }) as unknown as CustomerSummary,
    );
  });

  it('keeps the caret in the input after a click, so the filter can be retyped', async () => {
    render(<CustomerCombobox onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: /customer/i });

    await userEvent.click(input);
    const options = await screen.findAllByRole('option');
    await userEvent.click(options[0] as HTMLElement);

    expect(document.activeElement).toBe(input);
  });

  it('drops the selection the moment the filter is edited by hand', async () => {
    const onSelect = vi.fn();
    render(<CustomerCombobox onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: /customer/i });

    await userEvent.click(input);
    await screen.findAllByRole('option');
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ customerId: 'CUST-001' }) as unknown as CustomerSummary,
    );

    await userEvent.type(input, 'x');

    expect(onSelect).toHaveBeenLastCalledWith(undefined);
  });

  it('closes on Escape without selecting anything', async () => {
    const onSelect = vi.fn();
    render(<CustomerCombobox onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('combobox', { name: /customer/i }));
    await screen.findAllByRole('option');
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clears the selection, so the next match runs without a customer', async () => {
    const onSelect = vi.fn();
    render(<CustomerCombobox onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: /customer/i });

    await userEvent.click(input);
    await screen.findAllByRole('option');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    onSelect.mockClear();

    await userEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(onSelect).toHaveBeenCalledWith(undefined);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('says so when no customer matches the filter', async () => {
    serve([]);
    render(<CustomerCombobox onSelect={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox', { name: /customer/i }), 'zzz');

    expect(await screen.findByText('no customer matches')).toBeDefined();
  });
});
