'use client';

// Page-level notices that need an icon component. components/ui is a client
// module, so icon *components* can only be handed to EmptyState from here, not
// from a Server Component page (functions don't cross the RSC boundary).

import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { navItem, type RouteId } from '@/lib/nav';
import { ButtonLink } from './ButtonLink';

/** Placeholder until the screen is ported. Uses the screen's own nav icon. */
export function ComingSoon({ id, children }: { id: RouteId; children: ReactNode }) {
  return (
    <EmptyState icon={navItem(id).icon} title="Coming in Phase 1">
      {children}
    </EmptyState>
  );
}

/** The signed-in role may not open this screen (SPEC §2). */
export function Forbidden({ role, title }: { role: string; title: string }) {
  return (
    <EmptyState
      icon={Lock}
      title={`Your role (${role}) can’t open ${title}.`}
      action={<ButtonLink href="/pos">Back to POS</ButtonLink>}
    >
      Ask the owner if you need this screen.
    </EmptyState>
  );
}
