'use client';

// Ported from the Vite app's ErrorBoundary (main.jsx). Renders inside the shell,
// so navigation keeps working. In production, server errors arrive with a
// generic message plus a digest that matches the server log.

import { useEffect } from 'react';

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('POS crashed:', error);
  }, [error]);

  const detail = [error?.message || String(error), error?.digest && `Digest: ${error.digest}`].filter(Boolean).join('\n');

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6">
        <h1 className="text-xl font-extrabold text-ink">Something went wrong</h1>
        <p className="mt-2 text-[15px] text-ink-2">The screen stopped working, but saved sales and stock are safe on the server. Try again to continue.</p>
        <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-sunken p-3 text-xs text-muted">{detail}</pre>
        <button type="button" className="mt-4 h-11 rounded-[10px] bg-leaf px-4 font-semibold text-leaf-ink" onClick={() => retry()}>
          Try again
        </button>
      </div>
    </div>
  );
}
