import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
// Same imports, same order, as the Vite app's main.jsx: the two Atkinson
// variable fonts, then the design system.
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-mono/wght.css';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  // The Vite app's default document.title.
  title: 'POS and inventory',
  description: 'Point of sale, stock and sales reports for every branch, on one shared database.',
};

// Ported from legacy-vite-app/index.html. viewport-fit=cover lets the page
// draw under the phone's system bars; globals.css pads :root by the safe areas.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#123422',
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        {/* The Vite app mounted into <div id="root"> (100% tall); keeping the
            same wrapper lets ported h-full screens fill the viewport, while
            modals, toasts and #print-root still portal straight onto <body>
            (the print stylesheet hides every other child of <body>). */}
        <div id="root">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
