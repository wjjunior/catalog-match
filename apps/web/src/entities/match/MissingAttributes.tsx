import type { AttributeName } from '../../shared/api/client';

import { attributeLabel } from './attributeLabel';

export function MissingAttributes({
  attributes,
  label,
}: Readonly<{
  attributes: readonly AttributeName[];
  label: string;
}>) {
  if (attributes.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={label}>
        {attributes.map((attr) => (
          <li key={attr}>
            <span className="inline-block rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
              {attributeLabel(attr)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
