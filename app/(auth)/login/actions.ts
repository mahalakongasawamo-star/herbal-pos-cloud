'use server';

import { RedirectType, redirect } from 'next/navigation';
import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { safeNextPath } from '@/lib/nav';
import { createClient } from '@/lib/supabase/server';

export interface SignInState {
  error: string | null;
  /** Echoed back so the email survives React's form reset after a failed attempt. */
  email: string;
}

const WRONG_CREDENTIALS = 'Wrong email or password.';
const CANT_CONNECT = 'Can’t reach the sign-in server. Check the connection and try again.';
const TOO_MANY = 'Too many sign-in attempts. Wait a minute, then try again.';

/**
 * Email + password sign-in. On success the session cookies are written by the
 * server client and we redirect to the validated ?next= path (default /pos).
 * There is no sign-up: the owner creates staff accounts.
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNextPath(formData.get('next'));

  if (!email || !password) return { error: 'Enter your email and password.', email };

  let failure: string | null = null;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) failure = messageFor(error);
  } catch {
    failure = CANT_CONNECT;
  }
  if (failure) return { error: failure, email };

  // Outside the try: redirect() works by throwing.
  redirect(next, RedirectType.replace);
}

/** Never says whether it was the email or the password that was wrong. */
function messageFor(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return CANT_CONNECT;
  const status = isAuthApiError(error) ? error.status : (error as { status?: unknown })?.status;
  if (status === 429) return TOO_MANY;
  if (typeof status !== 'number' || status === 0 || status >= 500) return CANT_CONNECT;
  return WRONG_CREDENTIALS;
}
