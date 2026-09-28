// Read-only staff list. Legacy's Options "Cashiers" panel managed a plain
// list of station names a cashier picked from; that concept is gone now
// that the cashier IS the signed-in user (SPEC §9). This is what replaced
// it: every active member sees who's on the team, but creating an account
// is an owner-only, out-of-band step (scripts/seed-users.mjs / the Supabase
// dashboard) — the client has no ability to create auth.users rows.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '@/lib/nav';

export interface StaffMember {
  id: string;
  fullName: string;
  role: Role;
  branchCode: string | null;
  active: boolean;
}

interface StaffRow {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
  branch: { code: string } | { code: string }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function fetchStaff(supabase: SupabaseClient): Promise<StaffMember[]> {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role, active, branch:branches(code)').order('role').order('full_name');
  if (error) throw error;
  return (data as unknown as StaffRow[]).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    role: r.role as Role,
    branchCode: one(r.branch)?.code ?? null,
    active: r.active,
  }));
}
