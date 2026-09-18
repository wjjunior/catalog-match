import { useEffect, useState } from 'react';

import type { CustomerSummary } from '../../shared/api/client';
import { getCustomers } from '../../shared/api/client';

// The route does the filtering, so the browser never holds a customer list to search.
// A failed lookup leaves the list empty; the combobox then reads "no customer matches".
export function useCustomers(query: string): CustomerSummary[] {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    getCustomers(query, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setCustomers(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCustomers([]);
      });

    return () => {
      controller.abort();
    };
  }, [query]);

  return customers;
}
