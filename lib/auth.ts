// Server-side auth: who is signed in, their profile, and what they may open.
// This is the real gate (the proxy's redirect is only optimistic); RLS in the
// database is the last word on data.
//
// One lookup per request: getSession() is wrapped in React cache(), so the
// (app) layout and the page share it.

import 'server-only';
import { cache } from 'react';
import { redirect, unstable_rethrow } from 'next/navigation';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { LOGIN_PATH, canAccess, isRole, navItem, type Role, type RouteId } from '@/lib/nav';

export type { Role } from '@/lib/nav';

/** Row shape of public.profiles plus the embedded branch. Replaced by generated types later. */
export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  /** null means all branches (owner, or an all-branch manager). */
  branch_id: string | null;
  active: boolean;
  branch: { code: string; name: string } | null;
}

/** The verified auth user. Deliberately minimal: only what the UI shows. */
export interface SessionUser {
  id: string;
  email: string | null;
}

export type Session =
  | { status: 'signed-out' }
  /** Supabase couldn't be reached or answered with an error. Don't redirect: that loops with the proxy. */
  | { status: 'unavailable'; message: string }
  /** Signed in, but no profiles row, an inactive one, or one that isn't usable. */
  | { status: 'no-access'; user: SessionUser }
  | { status: 'ok'; user: SessionUser; profile: Profile };

const PROFILE_COLUMNS = 'id, full_name, role, branch_id, active, branch:branches(code, name)';

/**
 * Verifies the session (getClaims(): JWT signature + expiry, never the bare
 * cookie) and loads the caller's own profile through RLS.
 */
export const getSession = cache(async (): Promise<Session> => {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err); // Let Next's control-flow errors (e.g. the cookies() prerender bailout) through.
    return { status: 'unavailable', message: errorText(err) };
  }

  let user: SessionUser;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) {
      // A network problem or a 5xx isn't proof the user is signed out; anything
      // else (expired, revoked or invalid session) is.
      const serverSide = typeof error.status === 'number' && error.status >= 500;
      return isAuthRetryableFetchError(error) || serverSide ? { status: 'unavailable', message: error.message } : { status: 'signed-out' };
    }
    const claims = data?.claims;
    if (!claims || typeof claims.sub !== 'string') return { status: 'signed-out' };
    user = { id: claims.sub, email: typeof claims.email === 'string' && claims.email ? claims.email : null };
  } catch (err) {
    unstable_rethrow(err); // Let Next's control-flow errors (e.g. the cookies() prerender bailout) through.
    return { status: 'unavailable', message: errorText(err) };
  }

  try {
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle();
    if (error) return { status: 'unavailable', message: error.message };
    const profile = toProfile(data, user);
    if (!profile || !profile.active) return { status: 'no-access', user };
    // SPEC §2: a cashier always belongs to one branch. Without one, don't guess.
    if (profile.role === 'cashier' && !profile.branch_id) return { status: 'no-access', user };
    return { status: 'ok', user, profile };
  } catch (err) {
    unstable_rethrow(err); // Let Next's control-flow errors (e.g. the cookies() prerender bailout) through.
    return { status: 'unavailable', message: errorText(err) };
  }
});

/** The signed-in user and their active profile, or null for anything else. For Server Actions and one-off checks. */
export async function getSessionProfile(): Promise<{ user: SessionUser; profile: Profile } | null> {
  const session = await getSession();
  return session.status === 'ok' ? { user: session.user, profile: session.profile } : null;
}

/**
 * For the (app) layout. Redirects to /login when signed out; otherwise returns
 * the session so the layout can render the shell, a "No access" card, or a
 * "can't reach the server" card.
 */
export async function requireProfile(): Promise<Exclude<Session, { status: 'signed-out' }>> {
  const session = await getSession();
  if (session.status === 'signed-out') redirect(LOGIN_PATH);
  return session;
}

export type RouteAccess =
  | { status: 'ok'; user: SessionUser; profile: Profile }
  | { status: 'forbidden'; user: SessionUser; profile: Profile }
  /** The layout is already showing a card for these; the page should render nothing and fetch nothing. */
  | { status: 'no-access' }
  | { status: 'unavailable' };

/**
 * For every page under (app), before any data is fetched. Redirects to
 * /login?next=<route> when signed out. Returns 'forbidden' when the role may
 * not open this screen (SPEC §2), so the page can explain instead of 404ing.
 */
export async function requireRoute(id: RouteId): Promise<RouteAccess> {
  const session = await getSession();
  if (session.status === 'signed-out') redirect(`${LOGIN_PATH}?next=${encodeURIComponent(navItem(id).href)}`);
  if (session.status === 'no-access') return { status: 'no-access' };
  if (session.status === 'unavailable') return { status: 'unavailable' };
  if (!canAccess(session.profile.role, id)) return { status: 'forbidden', user: session.user, profile: session.profile };
  return session;
}

/** "MNLA" / "BAGUIO" / "All branches", for the header pill and the access check. */
export function branchScopeLabel(profile: Profile): string {
  if (!profile.branch_id) return 'All branches';
  return profile.branch?.code ?? 'Assigned branch';
}

// ---------------------------------------------------------------- helpers

function toProfile(row: unknown, user: SessionUser): Profile | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || !isRole(r.role)) return null;

  // PostgREST embeds a many-to-one as an object; be lenient about arrays too.
  const rawBranch = Array.isArray(r.branch) ? r.branch[0] : r.branch;
  let branch: Profile['branch'] = null;
  if (rawBranch && typeof rawBranch === 'object') {
    const b = rawBranch as Record<string, unknown>;
    if (typeof b.code === 'string') branch = { code: b.code, name: typeof b.name === 'string' ? b.name : b.code };
  }

  const fullName = typeof r.full_name === 'string' ? r.full_name.trim() : '';
  return {
    id: r.id,
    full_name: fullName || user.email || 'Unnamed user',
    role: r.role,
    branch_id: typeof r.branch_id === 'string' ? r.branch_id : null,
    active: r.active === true,
    branch,
  };
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}
