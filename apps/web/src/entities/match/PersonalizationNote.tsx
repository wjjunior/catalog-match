import type { PersonalizationExplanation } from '../../shared/api/client';

import styles from './PersonalizationNote.module.css';

export function PersonalizationNote({
  personalization,
}: {
  personalization: PersonalizationExplanation;
}) {
  const { reason, prior, overriddenBy } = personalization;

  return (
    <div className={styles.note}>
      <p className={styles.reason}>{reason}</p>
      <span className={styles.label}>prior</span>
      <span className={styles.prior}>{Math.round(prior * 100)}%</span>
      {overriddenBy !== undefined && overriddenBy.length > 0 && (
        <span className={styles.override}>overridden by {overriddenBy.join(', ')}</span>
      )}
    </div>
  );
}
