'use client';

import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui';

/** Full reload: re-runs the proxy and the server auth check from scratch. */
export function ReloadButton({ label = 'Try again' }: { label?: string }) {
  return (
    <Button variant="leaf" icon={RotateCw} onClick={() => window.location.reload()}>
      {label}
    </Button>
  );
}
