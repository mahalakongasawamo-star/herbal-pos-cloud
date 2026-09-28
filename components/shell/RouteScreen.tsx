// Phase 0 body shared by the seven (app) screens: the legacy page frame
// (mx-auto max-w-[1400px] p-4 sm:p-6), the module's PageHeader, a "Coming in
// Phase 1" placeholder and the Access check panel.
//
// Pages must call requireRoute() themselves and only render <RouteScreen>
// when it returns 'ok', so nothing is fetched for a caller who may not see it.

import type { ReactNode } from 'react';
import { PageHeader, Panel } from '@/components/ui';
import type { RouteAccess } from '@/lib/auth';
import { navItem, type RouteId } from '@/lib/nav';
import { AccessCheck } from './AccessCheck';
import { ComingSoon, Forbidden } from './RouteNotices';

const FRAME = 'mx-auto max-w-[1400px] p-4 sm:p-6';

interface RouteScreenProps {
  id: RouteId;
  access: Extract<RouteAccess, { status: 'ok' }>;
  /** The legacy module's PageHeader description. */
  description: string;
  /** What the screen will do once ported (Phase 1). */
  children: ReactNode;
}

export function RouteScreen({ id, access, description, children }: RouteScreenProps) {
  return (
    <div className={FRAME}>
      <PageHeader title={navItem(id).title} description={description} />
      <div className="grid gap-4">
        <Panel>
          <ComingSoon id={id}>{children}</ComingSoon>
        </Panel>
        <AccessCheck user={access.user} profile={access.profile} />
      </div>
    </div>
  );
}

/**
 * What a page renders when requireRoute() didn't return 'ok'. 'forbidden' gets
 * a friendly panel; 'no-access' / 'unavailable' render nothing because the
 * (app) layout is already showing its own card instead of the page.
 */
export function RouteBlocked({ id, access }: { id: RouteId; access: Exclude<RouteAccess, { status: 'ok' }> }) {
  if (access.status !== 'forbidden') return null;
  return (
    <div className={FRAME}>
      <Panel>
        <Forbidden role={access.profile.role} title={navItem(id).title} />
      </Panel>
    </div>
  );
}
