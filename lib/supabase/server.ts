// Server Supabase client (@supabase/ssr) for Server Components, Server
// Actions and Route Handlers. Create a new one per request; never share it.
//
// Every query runs as the signed-in user (anon key + their JWT from the
// cookies), so RLS applies. The service-role key is deliberately not used here.
//
// Untyped for now: generated Database types arrive with the migrations.

import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase responses are per user. Opt every request out of Next's data cache
 * so one user's rows can never be served to another, whatever the route's
 * caching mode turns out to be.
 */
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).');
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    global: { fetch: noStoreFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. Safe to
          // ignore: the proxy (proxy.ts) refreshes the session on every request
          // before rendering, and Server Actions (sign-in / sign-out) can write.
        }
      },
    },
  });
}
