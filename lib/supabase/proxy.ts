// Session refresh + optimistic auth redirects, called from the root proxy.ts
// (Next 16's name for middleware). Follows the @supabase/ssr middleware pattern:
//
//   1. Refresh the session here, before anything renders. Server Components
//      can't write cookies, so this is the only place an expired access token
//      gets swapped for a fresh one on a page load.
//   2. Write refreshed cookies to BOTH the request (so this render sees them)
//      and the response (so the browser stores them), plus the no-cache
//      headers the library hands us.
//   3. Carry those cookies over onto any redirect we return, or the browser
//      keeps a spent refresh token and gets signed out on the next request.
//
// This is only the optimistic check. The real gate is lib/auth.ts, run in the
// (app) layout and in every page, and RLS in the database.
//
// Never throws: if Supabase is unreachable or misconfigured the request is
// treated as signed out.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const LOGIN_PATH = '/login';
const HOME_PATH = '/pos';
/** Reachable while signed out. Everything else the proxy matches needs a session. */
const PUBLIC_PATHS = new Set([LOGIN_PATH]);
/** A hung auth server must not hang every page load. */
const AUTH_TIMEOUT_MS = 5000;

type CookieToSet = { name: string; value: string; options: CookieOptions };

const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(AUTH_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const written: CookieToSet[] = [];
  const cacheHeaders: Record<string, string> = {};

  const applyAuthState = (res: NextResponse) => {
    for (const { name, value, options } of written) res.cookies.set(name, value, options);
    for (const [header, value] of Object.entries(cacheHeaders)) res.headers.set(header, value);
    return res;
  };

  let response = NextResponse.next({ request });
  const signedIn = await hasSession(request, (cookiesToSet, headers) => {
    for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
    written.push(...cookiesToSet);
    Object.assign(cacheHeaders, headers);
    // Re-create the pass-through response so it forwards the updated request
    // cookies to the render, then re-apply everything written so far.
    response = applyAuthState(NextResponse.next({ request }));
  });

  const { pathname, search } = request.nextUrl;

  // Only redirect page navigations. Server Actions (POST) and API routes do
  // their own auth checks, and a redirect would break their responses.
  const isNavigation = (request.method === 'GET' || request.method === 'HEAD') && !pathname.startsWith('/api/');
  if (!isNavigation) return response;

  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!signedIn && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = LOGIN_PATH;
    target.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return redirectTo(target, applyAuthState);
  }

  if (signedIn && isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = HOME_PATH;
    target.search = '';
    return redirectTo(target, applyAuthState);
  }

  return response;
}

function redirectTo(url: URL, applyAuthState: (res: NextResponse) => NextResponse): NextResponse {
  const res = applyAuthState(NextResponse.redirect(url));
  // The target depends on who is asking; never let a shared cache keep it.
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

/**
 * Verifies the session in the request cookies, refreshing it if needed.
 * Uses getClaims(), which validates the JWT (locally against the project's
 * JWKS, or via the Auth server for symmetric keys). getSession() would only
 * read the cookie, which anyone can forge, so it is never used server-side.
 */
async function hasSession(
  request: NextRequest,
  onSetCookies: (cookiesToSet: CookieToSet[], headers: Record<string, string>) => void,
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  try {
    const supabase = createServerClient(url, key, {
      global: { fetch: fetchWithTimeout },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          onSetCookies(cookiesToSet, headers ?? {});
        },
      },
    });

    // Keep this call directly after createServerClient: the refresh has to
    // finish (and its cookies be written) before the response is built.
    const { data, error } = await supabase.auth.getClaims();
    return !error && typeof data?.claims?.sub === 'string';
  } catch {
    // Network failure, timeout, bad URL, malformed cookie: signed out.
    return false;
  }
}
