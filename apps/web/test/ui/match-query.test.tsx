import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ExampleChips } from '../../src/features/match-query/ExampleChips';
import { QueryForm } from '../../src/features/match-query/QueryForm';
import { EXAMPLE_QUERIES } from '../../src/shared/api/exampleQueries';

describe('QueryForm', () => {
  it('labels the input so it can be reached by name', () => {
    render(<QueryForm value="" onChange={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: /query/i })).toBeDefined();
  });

  it('reports every keystroke to its owner', async () => {
    const onChange = vi.fn();
    render(<QueryForm value="" onChange={onChange} onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox', { name: /query/i }), 'M8');

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('8');
  });

  it('submits on Enter', async () => {
    const onSubmit = vi.fn();
    render(<QueryForm value="M12 hex nut" onChange={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByRole('textbox', { name: /query/i }), '{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits on the button', async () => {
    const onSubmit = vi.fn();
    render(<QueryForm value="M12 hex nut" onChange={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Match' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('refuses a blank query on both paths', async () => {
    const onSubmit = vi.fn();
    render(<QueryForm value="   " onChange={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByRole('textbox', { name: /query/i }), '{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Match' }).hasAttribute('disabled')).toBe(true);
  });

  it('refuses a blank query submitted around the button as well', () => {
    const onSubmit = vi.fn();
    const { container } = render(<QueryForm value="   " onChange={vi.fn()} onSubmit={onSubmit} />);
    const form = container.querySelector('form');
    if (form === null) throw new Error('QueryForm rendered no form');

    fireEvent.submit(form);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('holds the button while a match is in flight', () => {
    render(<QueryForm value="M12 hex nut" onChange={vi.fn()} onSubmit={vi.fn()} busy />);

    expect(screen.getByRole('button', { name: 'Match' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('ExampleChips', () => {
  it('offers every example query from the challenge document', () => {
    render(<ExampleChips onPick={vi.fn()} />);

    expect(screen.getAllByRole('button')).toHaveLength(EXAMPLE_QUERIES.length);
  });

  it('hands the chosen query straight to its owner, text and all', async () => {
    const onPick = vi.fn();
    render(<ExampleChips onPick={onPick} />);

    await userEvent.click(screen.getByRole('button', { name: 'the same washers as last time' }));

    expect(onPick).toHaveBeenCalledWith('the same washers as last time');
  });
});
