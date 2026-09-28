// Phase 0 proof that auth + profiles + RLS work end to end: shows who the
// server thinks is signed in, and which branches Postgres lets this session
// read. The branch list is a real query with the user's own JWT, so it is
// exactly what RLS allows (cashier / single-branch manager: one branch;
// owner / all-branch manager: all of them).

import 'server-only';
import type { ReactNode } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { Panel, Pill } from '@/components/ui';
import { branchScopeLabel, type Profile, type SessionUser } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/nav';
import { createClient } from '@/lib/supabase/server';

type Branch = { code: string; name: string };

async function visibleBranches(): Promise<{ branches: Branch[]; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('branches').select('code, name').order('code');
    if (error) return { branches: [], error: error.message };
    const branches = (Array.isArray(data) ? data : [])
      .filter((b): b is Branch => !!b && typeof b.code === 'string')
      .map((b) => ({ code: b.code, name: typeof b.name === 'string' ? b.name : b.code }));
    return { branches, error: null };
  } catch (err) {
    unstable_rethrow(err);
    return { branches: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Does what RLS returned match what the profile says this user should see? */
function scopeVerdict(profile: Profile, branches: Branch[]): { ok: boolean; text: string } | null {
  if (!profile.branch_id) {
    return branches.length > 0
      ? { ok: true, text: 'Matches: all-branch access sees every branch.' }
      : { ok: false, text: 'All-branch access, but no branches came back. Check the branches RLS policy and the seed.' };
  }
  const own = profile.branch?.code;
  if (!own) return null;
  const onlyOwn = branches.length === 1 && branches[0].code === own;
  return onlyOwn
    ? { ok: true, text: `Matches: only ${own} is visible.` }
    : { ok: false, text: `Expected only ${own}. Check the branches RLS policy.` };
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-bold text-ink">{children}</dd>
    </div>
  );
}

export async function AccessCheck({ user, profile }: { user: SessionUser; profile: Profile }) {
  const { branches, error } = await visibleBranches();
  const verdict = error ? null : scopeVerdict(profile, branches);

  return (
    <Panel title="Access check" description="Live from Supabase: who you’re signed in as, and what row-level security lets this session read.">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Item label="Signed in as">{user.email ?? user.id}</Item>
        <Item label="Name">{profile.full_name}</Item>
        <Item label="Role">{ROLE_LABEL[profile.role]}</Item>
        <Item label="Branch scope">{branchScopeLabel(profile)}</Item>
      </dl>

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-semibold text-muted">Branches visible to you (RLS)</p>
        {error ? (
          <p className="mt-1 text-sm font-medium text-bad" role="alert">
            Couldn’t load branches: {error}
          </p>
        ) : branches.length ? (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {branches.map((b) => (
              <li key={b.code} className="flex items-center gap-2 text-sm text-ink-2">
                <Pill tone="leaf">{b.code}</Pill>
                {b.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">None. Row-level security returned no branches for this account.</p>
        )}
        {verdict && <p className={verdict.ok ? 'mt-3 text-sm font-semibold text-ok' : 'mt-3 text-sm font-semibold text-warn'}>{verdict.text}</p>}
      </div>
    </Panel>
  );
}
