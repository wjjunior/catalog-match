import type { FormEvent, ReactNode } from 'react';
import { X } from 'lucide-react';

import { cn, focusRing } from '../../shared/lib/utils';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/input';
import { Label } from '../../shared/ui/label';

interface QueryFormProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  customerField?: ReactNode;
}

export function QueryForm({
  value,
  onChange,
  onSubmit,
  busy = false,
  customerField,
}: QueryFormProps) {
  const blank = value.trim() === '';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blank || busy) return;
    onSubmit();
  }

  return (
    <form
      className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_280px_auto]"
      onSubmit={submit}
    >
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="query"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Query
        </Label>
        <div className="relative">
          <Input
            id="query"
            type="text"
            autoComplete="off"
            placeholder="M8 flat washer"
            className="pr-8"
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
          {value !== '' && (
            <button
              type="button"
              aria-label="Clear query"
              onClick={() => {
                onChange('');
              }}
              className={cn(
                'absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground',
                focusRing,
              )}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {customerField}

      <Button type="submit" disabled={blank || busy} className="w-full sm:w-auto">
        Match catalog
      </Button>
    </form>
  );
}
