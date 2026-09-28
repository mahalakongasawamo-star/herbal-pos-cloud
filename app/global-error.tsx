'use client'; // Error boundaries must be Client Components.

// Last-resort crash screen, shown when the root layout itself fails. It
// replaces the whole document, so it brings its own <html>/<body>, fonts and
// design system (Next does not apply the root layout's global styles here),
// and a React <title> because metadata exports are not supported in this file.
// The card itself is app/error.tsx, so both crash screens look the same.

import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-mono/wght.css';
import './globals.css';
import RootError from './error';

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        <title>POS and inventory</title>
        <div id="root">
          <RootError error={error} retry={retry} />
        </div>
      </body>
    </html>
  );
}
