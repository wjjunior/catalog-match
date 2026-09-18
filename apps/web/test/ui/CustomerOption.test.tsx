import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CustomerOption } from '../../src/entities/customer/CustomerOption';
import { customer } from './fixtures';

describe('CustomerOption', () => {
  it('shows the id, the name and how much this customer has ordered', () => {
    render(<CustomerOption customer={customer({ orderCount: 7 })} />);

    expect(screen.getByText('CUST-003')).toBeDefined();
    expect(screen.getByText('Marine Electrical Corp')).toBeDefined();
    expect(screen.getByText('7 orders')).toBeDefined();
  });

  it('counts a single order in the singular', () => {
    render(<CustomerOption customer={customer({ orderCount: 1 })} />);

    expect(screen.getByText('1 order')).toBeDefined();
  });
});
