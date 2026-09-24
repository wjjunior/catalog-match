import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Shared so the ring-offset colour fix (item 2 of the fix wave) lands once, not per component.
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

// shadcn's own input ring (see input.tsx), scoped with `has-` because the bordered box that
// must show it is the combobox's wrapper div, not the input Radix actually focuses.
export const comboboxFieldFocusRing =
  'has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50';
