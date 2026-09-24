import { CheckCircle2 } from 'lucide-react';

import type { MatchedAttribute } from '../../shared/api/client';

import { attributeLabel } from './attributeLabel';

export function MatchedAttributes({ matched }: { matched: readonly MatchedAttribute[] }) {
  if (matched.length === 0) return null;

  return (
    <ul
      className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1.5 p-0"
      aria-label="matched attributes"
    >
      {matched.map((attribute) => (
        <li key={attribute.attr} className="flex items-baseline gap-1.5 text-sm">
          <CheckCircle2 className="size-4 shrink-0 translate-y-0.5 text-ok" aria-hidden="true" />
          <span className="text-muted-foreground">{attributeLabel(attribute.attr)}</span>
          <span className="font-medium text-foreground">{attribute.item}</span>
        </li>
      ))}
    </ul>
  );
}
