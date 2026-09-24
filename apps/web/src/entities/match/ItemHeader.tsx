import { Package } from 'lucide-react';

import { Badge } from '../../shared/ui/Badge';

// The catalog has four columns and no image, so the icon is a placeholder, never a picture
// of the part.
export function ItemHeader({
  description,
  sku,
  active,
}: {
  description: string;
  sku: string;
  active: boolean;
}) {
  return (
    <header className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-secondary text-muted-foreground">
        <Package className="size-5" aria-hidden="true" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="m-0 break-words text-base font-semibold leading-[1.35]">{description}</h3>
        <p className="m-0 break-all font-mono text-xs text-muted-foreground">{sku}</p>
      </div>

      <div className="shrink-0">
        <Badge tone={active ? 'active' : 'inactive'}>{active ? 'Active' : 'Discontinued'}</Badge>
      </div>
    </header>
  );
}
