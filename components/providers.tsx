'use client';

import type { ReactNode } from 'react';
import { ConfirmProvider, ToastProvider } from '@/components/ui';

/** App-wide client context, nested as in the Vite app's main.jsx. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
