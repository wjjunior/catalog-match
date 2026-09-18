import type { Alternative } from '../../shared/api/client';
import { Badge } from '../../shared/ui/Badge';
import { ProgressBar } from '../../shared/ui/ProgressBar';

import { AttributeChips } from './AttributeChips';
import styles from './Card.module.css';

export function AlternativeCard({ alternative }: { alternative: Alternative }) {
  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <h3 className={styles.description}>{alternative.description}</h3>
        <Badge tone={alternative.active ? 'active' : 'inactive'}>
          {alternative.active ? 'Active' : 'Discontinued'}
        </Badge>
      </header>

      <p className={styles.sku}>{alternative.sku}</p>

      <div className={styles.meter}>
        <span className={styles.meterLabel}>closeness</span>
        <ProgressBar value={alternative.closeness} label="closeness" />
        <span className={styles.meterValue}>{Math.round(alternative.closeness * 100)}%</span>
      </div>

      <p className={styles.relaxed}>relaxed: {alternative.relaxed.join(', ')}</p>

      <AttributeChips explanation={alternative.explanation} />
    </article>
  );
}
