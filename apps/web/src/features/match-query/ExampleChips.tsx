import { EXAMPLE_QUERIES } from '../../shared/api/exampleQueries';
import { Chip } from '../../shared/ui/Chip';

import styles from './ExampleChips.module.css';

export function ExampleChips({ onPick }: { onPick: (query: string) => void }) {
  return (
    <ul className={styles.chips} aria-label="example queries">
      {EXAMPLE_QUERIES.map((query) => (
        <li key={query}>
          <Chip
            onClick={() => {
              onPick(query);
            }}
          >
            {query}
          </Chip>
        </li>
      ))}
    </ul>
  );
}
