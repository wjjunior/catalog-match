import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MatchCard } from '../../src/entities/match/MatchCard';
import { MatchDetails } from '../../src/entities/match/MatchDetails';
import { MatchedAttributes } from '../../src/entities/match/MatchedAttributes';
import { MissingAttributes } from '../../src/entities/match/MissingAttributes';
import { explanation, match } from './fixtures';

async function openDetails(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: 'View details' }));
  return screen.getByRole('button', { name: 'Hide details' });
}

describe('matched attributes', () => {
  it('shows what was typed, what the item carries and where the reading came from, once expanded', async () => {
    render(
      <MatchCard
        match={match({
          explanation: explanation({
            matched: [{ attr: 'type', query: 'HHB', item: 'tap bolt', provenance: 'corrected' }],
          }),
        })}
      />,
    );

    const reading = within(screen.getByRole('list', { name: 'matched attributes' })).getByRole(
      'listitem',
    );
    expect(reading.textContent).toContain('Type');
    expect(reading.textContent).toContain('tap bolt');
    expect(screen.queryByText('corrected')).toBeNull();

    await openDetails();

    const row = within(screen.getByRole('table', { name: 'Matched attributes' })).getAllByRole(
      'row',
    )[1];
    expect(row?.textContent).toContain('Type');
    expect(row?.textContent).toContain('HHB');
    expect(row?.textContent).toContain('tap bolt');
    expect(row?.textContent).toContain('corrected');
  });

  it('states the value once when the query and the item agree word for word', () => {
    render(
      <MatchedAttributes
        matched={[{ attr: 'diameter', query: 'M8', item: 'M8', provenance: 'explicit' }]}
      />,
    );

    const reading = screen.getByRole('listitem');
    expect(reading.textContent).toBe('DiameterM8');
    expect(reading.textContent).not.toContain('→');
  });

  it('marks an agreement that is only at family level', async () => {
    render(
      <MatchDetails
        sku="PXWASH88088PL0688"
        description="M8-1.25 FLAT WASHER 18-8 SS PLAIN"
        active
        explanation={explanation({
          matched: [
            {
              attr: 'material',
              query: 'stainless',
              item: '18-8 SS',
              provenance: 'explicit',
              partial: true,
            },
          ],
        })}
      />,
    );

    await openDetails();

    const row = within(screen.getByRole('table', { name: 'Matched attributes' })).getAllByRole(
      'row',
    )[1];
    expect(row?.textContent).toContain('partial');
  });

  it('lists the attributes the query never mentioned', () => {
    render(<MissingAttributes attributes={['material', 'finish']} label="Missing" />);

    const items = within(screen.getByRole('list', { name: 'Missing' })).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Material', 'Finish']);
  });

  it('keeps the residue token exactly as it was typed', async () => {
    render(
      <MatchDetails
        sku="PXWASH88088PL0688"
        description="M8-1.25 FLAT WASHER 18-8 SS PLAIN"
        active
        explanation={explanation({ unverified: ['nylon', 'insert'] })}
      />,
    );

    await openDetails();

    const items = within(screen.getByRole('list', { name: 'not verifiable' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.textContent)).toEqual(['nylon', 'insert']);
  });

  it('renders nothing at all when there is nothing to explain', () => {
    const { container, unmount } = render(<MatchedAttributes matched={[]} />);
    expect(container.firstChild).toBeNull();
    unmount();

    const missing = render(<MissingAttributes attributes={[]} label="Missing" />);
    expect(missing.container.firstChild).toBeNull();
  });
});
