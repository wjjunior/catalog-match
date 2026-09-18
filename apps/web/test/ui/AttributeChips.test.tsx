import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AttributeChips } from '../../src/entities/match/AttributeChips';
import { explanation } from './fixtures';

describe('AttributeChips', () => {
  it('shows what was typed, what the item carries and where the reading came from', () => {
    render(
      <AttributeChips
        explanation={explanation({
          matched: [{ attr: 'type', query: 'HHB', item: 'tap bolt', provenance: 'corrected' }],
        })}
      />,
    );

    const chip = within(screen.getByRole('list', { name: 'matched attributes' })).getByRole(
      'listitem',
    );
    expect(chip.textContent).toContain('type');
    expect(chip.textContent).toContain('HHB');
    expect(chip.textContent).toContain('tap bolt');
    expect(chip.textContent).toContain('corrected');
  });

  it('states the value once when the query and the item agree word for word', () => {
    render(
      <AttributeChips
        explanation={explanation({
          matched: [{ attr: 'diameter', query: 'M8', item: 'M8', provenance: 'explicit' }],
        })}
      />,
    );

    const chip = screen.getByRole('listitem');
    expect(chip.textContent).toContain('M8');
    expect(chip.textContent).not.toContain('→');
  });

  it('marks an agreement that is only at family level', () => {
    render(
      <AttributeChips
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

    expect(screen.getByRole('listitem').textContent).toContain('partial');
  });

  it('lists the attributes the query never mentioned', () => {
    render(<AttributeChips explanation={explanation({ unspecified: ['material', 'finish'] })} />);

    const items = within(screen.getByRole('list', { name: 'not specified' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.textContent)).toEqual(['material', 'finish']);
  });

  it('keeps the residue token exactly as it was typed', () => {
    render(<AttributeChips explanation={explanation({ unverified: ['nylon', 'insert'] })} />);

    const items = within(screen.getByRole('list', { name: 'not verifiable' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.textContent)).toEqual(['nylon', 'insert']);
  });

  it('renders nothing at all when there is nothing to explain', () => {
    const { container } = render(<AttributeChips explanation={explanation()} />);

    expect(container.firstChild).toBeNull();
  });
});
