import type { CustomerSummary } from '../../shared/api/client';

export function CustomerOption({ customer }: { customer: CustomerSummary }) {
  const { customerId, customerName, orderCount } = customer;

  return (
    <span className="flex w-full items-baseline gap-2">
      <span className="font-mono text-sm text-muted-foreground">{customerId}</span>
      <span className="flex-1">{customerName}</span>
      <span className="whitespace-nowrap text-sm text-muted-foreground">{`${String(orderCount)} ${orderCount === 1 ? 'order' : 'orders'}`}</span>
    </span>
  );
}
