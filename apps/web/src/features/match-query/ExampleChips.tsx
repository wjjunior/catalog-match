import { useState } from 'react';
import { Lightbulb } from 'lucide-react';

import { EXAMPLE_QUERIES } from '../../shared/api/exampleQueries';
import { Button } from '../../shared/ui/Button';
import { Chip } from '../../shared/ui/Chip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';

const VISIBLE_COUNT = 5;

export function ExampleChips({ onPick }: { onPick: (query: string) => void }) {
  const [open, setOpen] = useState(false);
  const visible = EXAMPLE_QUERIES.slice(0, VISIBLE_COUNT);
  const remaining = EXAMPLE_QUERIES.length - VISIBLE_COUNT;

  function pick(query: string) {
    setOpen(false);
    onPick(query);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Lightbulb className="size-3.5" aria-hidden="true" />
        Example queries
      </span>
      <ul className="flex flex-wrap items-center gap-2" aria-label="example queries">
        {visible.map((query) => (
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
        <li className="text-sm text-muted-foreground">+{remaining}</li>
        <li>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="quiet">Show all</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Example queries</DialogTitle>
              </DialogHeader>
              <ul
                className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto"
                aria-label="all example queries"
              >
                {EXAMPLE_QUERIES.map((query) => (
                  <li key={query}>
                    <Chip
                      onClick={() => {
                        pick(query);
                      }}
                    >
                      {query}
                    </Chip>
                  </li>
                ))}
              </ul>
            </DialogContent>
          </Dialog>
        </li>
      </ul>
    </div>
  );
}
