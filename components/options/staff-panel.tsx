'use client';

// Replaces legacy-vite-app/src/modules/Options.jsx's "Cashiers" panel, which
// managed a plain list of station names a cashier picked from at login.
// That concept is gone now that the cashier IS the signed-in user
// (SPEC §9), and creating a staff ACCOUNT needs the Supabase Admin API
// (a service-role key the browser client can never hold) — so there is no
// "add cashier" UI possible from this page at all. This is a read-only
// roster instead, with a pointer to the owner-only, out-of-band way new
// accounts actually get created.
import { useEffect, useState } from 'react';
import { Panel, Pill } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { fetchStaff, type StaffMember } from '@/lib/data/staff';
import { ROLE_LABEL } from '@/lib/nav';

export function StaffPanel() {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchStaff(createClient())
      .then((rows) => {
        if (live) setStaff(rows);
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Panel title="Staff" description="Everyone with a sign-in, across both branches.">
      {error && <p className="text-sm text-bad">{error}</p>}
      {!error && !staff && <p className="text-sm text-muted">Loading…</p>}
      {staff && staff.length === 0 && <p className="text-sm text-muted">No staff accounts yet.</p>}
      {staff && staff.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{s.fullName}</p>
                <p className="text-xs text-muted">
                  {ROLE_LABEL[s.role]} · {s.branchCode ?? 'All branches'}
                </p>
              </div>
              <Pill tone={s.active ? 'ok' : 'neutral'}>{s.active ? 'Active' : 'Inactive'}</Pill>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">
        New accounts are created by the owner outside this app — run{' '}
        <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[11px]">scripts/seed-users.mjs</code> against the cloud
        project, or add the person directly from the Supabase dashboard. The browser app never holds the service-role key
        that step needs.
      </p>
    </Panel>
  );
}
