'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import type { Explanation, MatchedAttribute } from '../../shared/api/client';
import { cn } from '../../shared/lib/utils';
import { Button } from '../../shared/ui/Button';
import { Chip } from '../../shared/ui/Chip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../shared/ui/collapsible';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../shared/ui/table';

import { attributeLabel } from './attributeLabel';

// shadcn's cells never wrap, which needs a horizontal scroll inside the card on a phone.
const WRAPPING = '[&_th]:whitespace-normal [&_td]:whitespace-normal';

const CAPTION = 'mt-0 caption-top text-left text-xs font-semibold uppercase tracking-wide';

function matchType(attribute: MatchedAttribute): string {
  return attribute.partial === true ? `${attribute.provenance}, partial` : attribute.provenance;
}

export function MatchDetails({
  sku,
  description,
  active,
  explanation,
}: Readonly<{
  sku: string;
  description: string;
  active: boolean;
  explanation: Explanation;
}>) {
  const [open, setOpen] = useState(false);
  const { matched, unspecified, unverified } = explanation;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col">
      <CollapsibleTrigger asChild>
        <Button variant="quiet" className="gap-1.5 self-start px-3 py-1.5 text-xs">
          <ChevronDown
            className={cn('size-4 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
          {open ? 'Hide details' : 'View details'}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-3 flex flex-col gap-5 border-t border-border/70 pt-3">
          {matched.length > 0 && (
            <Table className={WRAPPING}>
              <TableCaption className={CAPTION}>Matched attributes</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Attribute</TableHead>
                  <TableHead>Query value</TableHead>
                  <TableHead>Catalog value</TableHead>
                  <TableHead>Match type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matched.map((attribute) => (
                  <TableRow key={attribute.attr}>
                    <TableCell className="font-medium">{attributeLabel(attribute.attr)}</TableCell>
                    <TableCell>{attribute.query}</TableCell>
                    <TableCell>{attribute.item}</TableCell>
                    <TableCell className="text-muted-foreground">{matchType(attribute)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {unspecified.length > 0 && (
            <Table className={WRAPPING}>
              <TableCaption className={CAPTION}>Not specified in query</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Attribute</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unspecified.map((attr) => (
                  <TableRow key={attr}>
                    <TableCell className="font-medium">{attributeLabel(attr)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      Not asked for, so it did not constrain this match
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {unverified.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide">Not verifiable</p>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="not verifiable">
                {unverified.map((token, index) => (
                  <li key={`${token}-${String(index)}`}>
                    <Chip tone="unverified">{token}</Chip>
                  </li>
                ))}
              </ul>
              <p className="m-0 text-xs text-muted-foreground">
                Words left over from the query that no catalog attribute could confirm.
              </p>
            </div>
          )}

          <Table className={WRAPPING}>
            <TableCaption className={CAPTION}>Catalog record</TableCaption>
            <TableBody>
              <TableRow>
                <TableHead scope="row" className="w-28">
                  SKU
                </TableHead>
                <TableCell className="break-all font-mono">{sku}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead scope="row">Description</TableHead>
                <TableCell>{description}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead scope="row">Status</TableHead>
                <TableCell>{active ? 'Active' : 'Discontinued'}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
