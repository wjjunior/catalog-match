import { useState } from 'react';

import { CustomerOption } from '../../entities/customer/CustomerOption';
import type { CustomerSummary } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../shared/ui/command';
import { Label } from '../../shared/ui/label';
import { Popover, PopoverAnchor, PopoverContent } from '../../shared/ui/popover';

import { useCustomers } from './useCustomers';

export function CustomerCombobox({
  onSelect,
}: {
  onSelect: (customer: CustomerSummary | undefined) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const customers = useCustomers(query);

  function choose(customer: CustomerSummary) {
    setQuery(customer.customerName);
    setOpen(false);
    onSelect(customer);
  }

  return (
    // The route owns the filtering, so cmdk must not filter its answer again; and cmdk
    // names the input from its own `label`, which the visible one below cannot reach.
    <Command shouldFilter={false} label="Customer" className="overflow-visible bg-transparent">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="flex items-end gap-2">
            <Label className="flex flex-1 flex-col items-stretch gap-1.5 font-normal">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Customer
              </span>
              <div className="rounded-md border border-input shadow-xs has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50 [&>[data-slot=command-input-wrapper]]:border-b-0">
                <CommandInput
                  placeholder="Any customer"
                  className="h-9 select-text"
                  value={query}
                  onFocus={() => {
                    setOpen(true);
                  }}
                  onKeyDown={(event) => {
                    // The list is the popover's content, so once it is closed nothing is
                    // left to hear the arrow that should bring it back.
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') setOpen(true);
                  }}
                  onValueChange={(next) => {
                    setQuery(next);
                    setOpen(true);
                    // Typing over a chosen name abandons it: the box must never show one
                    // customer while the next match is sent for another.
                    onSelect(undefined);
                  }}
                />
              </div>
            </Label>
            {query !== '' && (
              <Button
                variant="quiet"
                onClick={() => {
                  setQuery('');
                  setOpen(false);
                  onSelect(undefined);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) p-0"
          // The field keeps the caret, never the popover: opening must not take focus,
          // and neither must a mousedown on a row.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          <CommandList label="Customer">
            <CommandEmpty>no customer matches</CommandEmpty>
            {customers.map((customer) => (
              <CommandItem
                key={customer.customerId}
                value={customer.customerId}
                onSelect={() => {
                  choose(customer);
                }}
              >
                <CustomerOption customer={customer} />
              </CommandItem>
            ))}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  );
}
