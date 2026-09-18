import type { KeyboardEvent } from 'react';
import { useState } from 'react';

import { CustomerOption } from '../../entities/customer/CustomerOption';
import type { CustomerSummary } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';

import { useCustomers } from './useCustomers';
import styles from './CustomerCombobox.module.css';

const LISTBOX_ID = 'customer-listbox';

function optionId(customer: CustomerSummary): string {
  return `customer-option-${customer.customerId}`;
}

export function CustomerCombobox({
  onSelect,
}: {
  onSelect: (customer: CustomerSummary | undefined) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const customers = useCustomers(query);
  const activeCustomer = active < 0 ? undefined : customers[active];

  function choose(customer: CustomerSummary) {
    setQuery(customer.customerName);
    setOpen(false);
    setActive(-1);
    onSelect(customer);
  }

  function clear() {
    setQuery('');
    setOpen(false);
    setActive(-1);
    onSelect(undefined);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setOpen(true);
        setActive((index) => Math.min(index + 1, customers.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        break;
      case 'Enter':
        if (open && activeCustomer !== undefined) {
          event.preventDefault();
          choose(activeCustomer);
        }
        break;
      case 'Escape':
        setOpen(false);
        setActive(-1);
        break;
      default:
        break;
    }
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="customer">
        Customer
      </label>

      <div className={styles.row}>
        <input
          id="customer"
          className={styles.input}
          type="text"
          role="combobox"
          autoComplete="off"
          placeholder="Any customer"
          aria-expanded={open}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={
            activeCustomer === undefined ? undefined : optionId(activeCustomer)
          }
          value={query}
          onFocus={() => {
            setOpen(true);
          }}
          onBlur={() => {
            setOpen(false);
          }}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
        />
        {query !== '' && (
          <Button variant="quiet" onClick={clear}>
            Clear
          </Button>
        )}
      </div>

      {open && (
        <div className={styles.popup}>
          {customers.length === 0 ? (
            <p className={styles.empty}>no customer matches</p>
          ) : (
            <ul className={styles.options} id={LISTBOX_ID} role="listbox" aria-label="Customer">
              {customers.map((customer, index) => (
                <li
                  key={customer.customerId}
                  id={optionId(customer)}
                  className={styles.option}
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active}
                  // Mousedown runs before the input's blur, so the click is never lost to it.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(customer);
                  }}
                >
                  <CustomerOption customer={customer} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
