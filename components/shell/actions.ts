'use server';

import { cookies } from 'next/headers';
import { RedirectType, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Signs out this browser only (scope 'local'): a cashier leaving one till
 * shouldn't end the same account's session on another device. supabase-js
 * clears the session cookies even when the Auth server can't be reached.
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Couldn't even build a client (e.g. env missing). Drop the auth cookies by hand.
    try {
      const store = await cookies();
      for (const c of store.getAll()) if (c.name.startsWith('sb-')) store.delete(c.name);
    } catch {
      // Nothing else to do; the login page still works.
    }
  }
  redirect('/login', RedirectType.replace);
}
