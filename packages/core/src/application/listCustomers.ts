import type { CustomerSummary } from '../domain/catalog';
import type { OrderHistoryRepository } from '../ports/orderHistoryRepository';

export interface ListCustomersDeps {
  readonly history: OrderHistoryRepository;
}

const searchable = (customer: CustomerSummary): string[] => [
  customer.customerName.toLowerCase(),
  customer.customerId.toLowerCase(),
];

export function listCustomers(deps: ListCustomersDeps): (q?: string) => readonly CustomerSummary[] {
  return (q) => {
    const customers = deps.history.customers();
    const needle = q?.trim().toLowerCase();
    if (needle === undefined || needle === '') return customers;

    const matches = (customer: CustomerSummary, how: (field: string) => boolean): boolean =>
      searchable(customer).some(how);

    const prefix = customers.filter((customer) =>
      matches(customer, (field) => field.startsWith(needle)),
    );
    const contains = customers.filter(
      (customer) =>
        !prefix.includes(customer) && matches(customer, (field) => field.includes(needle)),
    );

    return [...prefix, ...contains];
  };
}
