import type { ReactNode } from 'react';

import type { Explanation, MatchedAttribute } from '../../shared/api/client';
import { Badge } from '../../shared/ui/Badge';
import { Chip } from '../../shared/ui/Chip';

import styles from './AttributeChips.module.css';

function reading(attribute: MatchedAttribute): string {
  return attribute.query === attribute.item
    ? attribute.query
    : `${attribute.query} → ${attribute.item}`;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.group}>
      <span className={styles.label}>{label}</span>
      <ul className={styles.chips} aria-label={label}>
        {children}
      </ul>
    </div>
  );
}

export function AttributeChips({ explanation }: { explanation: Explanation }) {
  const { matched, unspecified, unverified } = explanation;

  if (matched.length === 0 && unspecified.length === 0 && unverified.length === 0) return null;

  return (
    <div className={styles.groups}>
      {matched.length > 0 && (
        <Group label="matched attributes">
          {matched.map((attribute) => (
            <li key={attribute.attr}>
              <Chip tone="matched">
                <span className={styles.attr}>{attribute.attr}</span>
                <span>{reading(attribute)}</span>
                <Badge>{attribute.provenance}</Badge>
                {attribute.partial === true && <Badge>partial</Badge>}
              </Chip>
            </li>
          ))}
        </Group>
      )}

      {unspecified.length > 0 && (
        <Group label="not specified">
          {unspecified.map((attr) => (
            <li key={attr}>
              <Chip tone="unspecified">{attr}</Chip>
            </li>
          ))}
        </Group>
      )}

      {unverified.length > 0 && (
        <Group label="not verifiable">
          {unverified.map((token, index) => (
            <li key={`${token}-${String(index)}`}>
              <Chip tone="unverified">{token}</Chip>
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}
