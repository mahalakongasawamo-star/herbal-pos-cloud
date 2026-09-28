// Browser Supabase client (@supabase/ssr). Use only in Client Components.
//
// The session lives in cookies (not localStorage) so the server and the proxy
// read the same session the browser writes. createBrowserClient returns one
// shared instance per page, so calling this from several components is fine.
//
// Untyped for now: generated Database types arrive with the migrations.

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // Referenced literally so Next can inline NEXT_PUBLIC_* values at build time.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).');
  }
  return createBrowserClient(url, key);
}
