import { PackageX } from 'lucide-react';

import type { MatchResponse } from '../../shared/api/client';

import { statusText } from './StatusLine';

// A note is the domain's own explanation; only a response with none of them falls back to
// the generic per-status sentence `StatusLine` already computes.
function explanationLines(response: MatchResponse): readonly string[] {
  return response.notes.length > 0
    ? response.notes.map((note) => note.message)
    : [statusText(response)];
}

export function EmptyState({ response }: Readonly<{ response: MatchResponse }>) {
  return (
    <section
      aria-labelledby="empty-state"
      className="flex flex-col items-center gap-2 rounded-xl border border-border/70 bg-card p-8 text-center shadow-sm sm:p-10"
    >
      <PackageX className="size-10 text-muted-foreground" aria-hidden="true" />
      <h2 id="empty-state" className="m-0 text-lg font-semibold tracking-tight">
        {/* The fallback can leave a large compatible set with nothing to order it, and
            calling that "no compatible items" would contradict the note below. */}
        {response.compatibleCount > 0 ? 'Nothing to rank' : 'No compatible items'}
      </h2>
      <output className="flex max-w-prose flex-col gap-1">
        {explanationLines(response).map((line, index) => (
          <p key={`${line}-${String(index)}`} className="m-0 text-sm text-muted-foreground">
            {line}
          </p>
        ))}
      </output>
    </section>
  );
}
