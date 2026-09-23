import type { FormEvent } from 'react';

import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/input';
import { Label } from '../../shared/ui/label';

interface QueryFormProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy?: boolean;
}

export function QueryForm({ value, onChange, onSubmit, busy = false }: QueryFormProps) {
  const blank = value.trim() === '';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blank || busy) return;
    onSubmit();
  }

  return (
    <form className="flex flex-col gap-1.5" onSubmit={submit}>
      <Label
        htmlFor="query"
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Query
      </Label>
      <div className="flex gap-2">
        <Input
          id="query"
          type="text"
          autoComplete="off"
          placeholder="M8 flat washer"
          className="flex-1"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        <Button type="submit" disabled={blank || busy}>
          Match
        </Button>
      </div>
    </form>
  );
}
