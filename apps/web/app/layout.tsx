import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Catalog Match',
  description: 'Match a free-text fastener description to a catalog SKU.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body className="m-0 bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
