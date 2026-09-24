import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AlternativeCard } from '../../src/entities/match/AlternativeCard';
import { MatchCard } from '../../src/entities/match/MatchCard';
import { CustomerOrderHistory } from '../../src/entities/match/CustomerOrderHistory';
import { alternative, explanation, match } from './fixtures';

describe('MatchCard', () => {
  it('names the item by description and SKU', () => {
    render(<MatchCard match={match()} />);

    expect(screen.getByText('M8-1.25 FLAT WASHER 18-8 SS PLAIN')).toBeDefined();
    expect(screen.getByText('PXWASH88088PL0688')).toBeDefined();
  });

  it('marks an active item and a discontinued one differently', () => {
    const { unmount } = render(<MatchCard match={match()} />);
    expect(screen.getByText('Active')).toBeDefined();
    unmount();

    render(<MatchCard match={match({ active: false })} />);
    expect(screen.getByText('Discontinued')).toBeDefined();
    expect(screen.queryByText('Active')).toBeNull();
  });

  it('shows confidence as a bar, a percentage and the label the API assigned', () => {
    render(<MatchCard match={match({ confidence: 0.82, label: 'High' })} />);

    expect(
      screen.getByRole('progressbar', { name: 'Match confidence' }).getAttribute('value'),
    ).toBe('82');
    expect(screen.getByText('82%')).toBeDefined();
    expect(screen.getByText('High')).toBeDefined();
  });

  it('omits the label when the API sent none', () => {
    render(<MatchCard match={match({ label: undefined })} />);

    expect(screen.queryByText('High')).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Match confidence' })).toBeDefined();
  });

  it('reads the matched attributes in business terms', () => {
    render(
      <MatchCard
        match={match({
          explanation: explanation({
            matched: [{ attr: 'diameter', query: 'M8', item: 'M8', provenance: 'explicit' }],
          }),
        })}
      />,
    );

    expect(screen.getByRole('list', { name: 'matched attributes' })).toBeDefined();
  });

  it('carries the personalization note only when the response has one', () => {
    const { unmount } = render(<MatchCard match={match()} />);
    expect(screen.queryByText(/history/i)).toBeNull();
    unmount();

    render(
      <MatchCard
        match={match({
          explanation: explanation({
            personalization: { reason: 'history prefers 18-8 SS plain', prior: 0.41 },
          }),
        })}
      />,
    );
    expect(screen.getByText(/history prefers 18-8 SS plain/)).toBeDefined();
  });
});

describe('AlternativeCard', () => {
  it('names the item by description and SKU', () => {
    render(<AlternativeCard alternative={alternative()} />);

    expect(
      screen.getByText('M8-1.25 X 30MM SOCKET HEAD CAP SCREW ALLOY BLACK OXIDE'),
    ).toBeDefined();
    expect(screen.getByText('PXSOC0830ALBO0004')).toBeDefined();
  });

  it('reports closeness rather than confidence, and says what was given up', () => {
    render(<AlternativeCard alternative={alternative({ closeness: 0.67, relaxed: ['length'] })} />);

    expect(screen.getByRole('progressbar', { name: 'Closeness' }).getAttribute('value')).toBe(
      '67',
    );
    expect(screen.getByText('67%')).toBeDefined();
    expect(screen.getByText('relaxed: length')).toBeDefined();
    expect(screen.queryByRole('progressbar', { name: 'Match confidence' })).toBeNull();
  });

  it('lists every relaxed constraint', () => {
    render(<AlternativeCard alternative={alternative({ relaxed: ['length', 'finish'] })} />);

    expect(screen.getByText('relaxed: length, finish')).toBeDefined();
  });
});

describe('CustomerOrderHistory', () => {
  it('renders the reason core wrote', () => {
    render(
      <CustomerOrderHistory
        personalization={{ reason: 'history prefers steel yellow zinc', prior: 0.41 }}
      />,
    );

    expect(screen.getByText(/history prefers steel yellow zinc/)).toBeDefined();
  });

  it('shows the prior as a percentage', () => {
    render(<CustomerOrderHistory personalization={{ reason: 'because', prior: 0.41 }} />);

    expect(screen.getByText('41%')).toBeDefined();
  });

  it('names the attributes the query overrode history with', () => {
    render(
      <CustomerOrderHistory
        personalization={{ reason: 'because', prior: 0.2, overriddenBy: ['material', 'finish'] }}
      />,
    );

    expect(screen.getByText('overridden by material, finish')).toBeDefined();
  });

  it('says nothing about overrides when there are none', () => {
    render(<CustomerOrderHistory personalization={{ reason: 'because', prior: 0.2 }} />);

    expect(screen.queryByText(/overridden/)).toBeNull();
  });
});
