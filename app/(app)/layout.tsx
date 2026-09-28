// Signed-in app frame. Every route under (app) is per user: the auth lookup
// reads cookies() (a request-time API), which makes each render dynamic, and
// all Supabase fetches are no-store (lib/supabase/server.ts). Nothing here is
// prerendered or shared between users.
//
// The layout does not re-run on client-side navigation, so it is not the
// access gate for screens: each page calls requireRoute() itself.

import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { NoAccessCard, UnavailableCard } from '@/components/shell/StatusCards';
import { branchScopeLabel, requireProfile } from '@/lib/auth';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Redirects to /login when signed out.
  const session = await requireProfile();

  // Signed in but not set up: explain, don't bounce (a redirect would loop
  // with the proxy, which sends signed-in users away from /login).
  if (session.status === 'no-access') return <NoAccessCard email={session.user.email} />;
  if (session.status === 'unavailable') return <UnavailableCard message={session.message} />;

  const { profile } = session;
  return (
    <AppShell
      role={profile.role}
      fullName={profile.full_name}
      scopeLabel={branchScopeLabel(profile)}
      allBranches={profile.branch_id === null}
      // lowStockCount: wired up in Phase 1 (Inventory badge).
    >
      {children}
    </AppShell>
  );
}
