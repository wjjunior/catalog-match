import type { CustomerSummary } from '../../shared/api/client';

import styles from './CustomerOption.module.css';

export function CustomerOption({ customer }: { customer: CustomerSummary }) {
  const { customerId, customerName, orderCount } = customer;

  return (
    <span className={styles.option}>
      <span className={styles.id}>{customerId}</span>
      <span className={styles.name}>{customerName}</span>
      <span
        className={styles.orders}
      >{`${String(orderCount)} ${orderCount === 1 ? 'order' : 'orders'}`}</span>
    </span>
  );
}
