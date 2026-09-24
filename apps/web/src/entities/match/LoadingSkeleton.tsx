import { Skeleton } from '../../shared/ui/skeleton';

const CARD =
  'flex flex-col gap-3.5 rounded-xl border border-border/70 bg-card p-4 shadow-sm sm:p-5';

function CardSkeleton() {
  return (
    <div className={CARD}>
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

// The shape of the summary and result cards about to arrive, so the layout does not jump
// once they do; the search card above stays live while this shows.
export function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status">
      <span className="sr-only">Matching…</span>

      <div className={CARD} aria-hidden="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="flex flex-col gap-3" aria-hidden="true">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
