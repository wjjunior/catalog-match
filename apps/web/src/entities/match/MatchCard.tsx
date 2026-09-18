import type { Match } from '../../shared/api/client';
import { Badge } from '../../shared/ui/Badge';
import { ProgressBar } from '../../shared/ui/ProgressBar';

import { AttributeChips } from './AttributeChips';
import { PersonalizationNote } from './PersonalizationNote';
import styles from './Card.module.css';

export function MatchCard({ match }: { match: Match }) {
  const { explanation } = match;

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <h3 className={styles.description}>{match.description}</h3>
        <Badge tone={match.active ? 'active' : 'inactive'}>
          {match.active ? 'Active' : 'Discontinued'}
        </Badge>
      </header>

      <p className={styles.sku}>{match.sku}</p>

      <div className={styles.meter}>
        <span className={styles.meterLabel}>confidence</span>
        <ProgressBar value={match.confidence} label="confidence" />
        <span className={styles.meterValue}>{Math.round(match.confidence * 100)}%</span>
        {match.label !== undefined && <Badge>{match.label}</Badge>}
      </div>

      <AttributeChips explanation={explanation} />

      {explanation.personalization !== undefined && (
        <PersonalizationNote personalization={explanation.personalization} />
      )}
    </article>
  );
}
