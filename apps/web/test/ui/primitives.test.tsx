import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Badge } from '../../src/shared/ui/Badge';
import { Button } from '../../src/shared/ui/Button';
import { Chip } from '../../src/shared/ui/Chip';
import { ProgressBar } from '../../src/shared/ui/ProgressBar';

describe('Button', () => {
  it('is a submit-free button unless asked otherwise, so a chip never posts a form', () => {
    render(<Button>Match</Button>);

    expect(screen.getByRole('button', { name: 'Match' }).getAttribute('type')).toBe('button');
  });

  it('submits when it is given the submit type', () => {
    render(<Button type="submit">Match</Button>);

    expect(screen.getByRole('button', { name: 'Match' }).getAttribute('type')).toBe('submit');
  });

  it('calls its handler on click and stays silent while disabled', async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>Live</Button>
        <Button onClick={onClick} disabled>
          Dead
        </Button>
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Live' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dead' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Badge', () => {
  it('renders its label', () => {
    render(<Badge>Active</Badge>);

    expect(screen.getByText('Active')).toBeDefined();
  });

  it('marks the tone on the element rather than in the text', () => {
    render(<Badge tone="inactive">Discontinued</Badge>);

    expect(screen.getByText('Discontinued').getAttribute('data-tone')).toBe('inactive');
  });
});

describe('ProgressBar', () => {
  it('exposes the value to assistive technology as a percentage', () => {
    render(<ProgressBar value={0.82} label="Confidence" />);

    const bar = screen.getByRole('progressbar', { name: 'Confidence' });
    expect(bar.getAttribute('value')).toBe('82');
    expect(bar.getAttribute('max')).toBe('100');
  });

  it('rounds to a whole percent so the same response always renders the same bar', () => {
    render(<ProgressBar value={0.8249} label="Confidence" />);

    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('82');
  });

  it('clamps a value outside the unit interval', () => {
    render(
      <>
        <ProgressBar value={1.4} label="Over" />
        <ProgressBar value={-0.2} label="Under" />
      </>,
    );

    expect(screen.getByRole('progressbar', { name: 'Over' }).getAttribute('value')).toBe('100');
    expect(screen.getByRole('progressbar', { name: 'Under' }).getAttribute('value')).toBe('0');
  });
});

describe('Chip', () => {
  it('is static text when it has no handler', () => {
    render(<Chip>diameter</Chip>);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('diameter')).toBeDefined();
  });

  it('becomes a button when it can be clicked', async () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>M8 flat washer</Chip>);

    await userEvent.click(screen.getByRole('button', { name: 'M8 flat washer' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
