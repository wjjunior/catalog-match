import { EXAMPLE_QUERIES } from '../../shared/api/exampleQueries';
import { Chip } from '../../shared/ui/Chip';

export function ExampleChips({ onPick }: { onPick: (query: string) => void }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="example queries">
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
