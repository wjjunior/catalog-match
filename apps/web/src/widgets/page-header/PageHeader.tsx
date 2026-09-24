'use client';

import { HelpCircle } from 'lucide-react';

import { Button } from '../../shared/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';

// docs/DESIGN.md 5.5 asks for this on the page, and 12 makes it the mitigation for a reader
// taking the number for a calibrated probability; the thresholds stay in matching/config.ts.
export function PageHeader() {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl tracking-tight">Catalog Match</h1>
        <p className="m-0 text-muted-foreground">
          Find the best catalog item from a natural language request
        </p>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="quiet" className="shrink-0 self-start gap-1.5">
            <HelpCircle className="size-4" aria-hidden="true" />
            How it works
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What confidence means</DialogTitle>
          </DialogHeader>
          <DialogDescription className="leading-normal">
            <strong>Confidence</strong> is the model&rsquo;s estimate that this SKU is the intended
            one, given the query, the selected customer and an explicit set of assumptions. It is
            not a measured frequency, and it is comparable within one answer rather than across
            answers. High, Medium and Low are bands of that estimate, attached after the calibration
            measurement rather than promised before it. An alternative carries{' '}
            <strong>closeness</strong> instead, because it is not the thing that was asked for.
          </DialogDescription>
        </DialogContent>
      </Dialog>
    </header>
  );
}
