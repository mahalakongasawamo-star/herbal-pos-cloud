'use client';

import { useActionState } from 'react';
import { LogIn } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { BrandMark } from '@/components/shell/BrandMark';
import { APP_NAME } from '@/lib/nav';
import { signIn, type SignInState } from './actions';

const INITIAL: SignInState = { error: null, email: '' };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, INITIAL);
  const invalid = !!state.error;

  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6">
      <div className="flex items-center gap-3">
        <BrandMark />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold leading-tight text-ink">{APP_NAME}</p>
          <p className="truncate text-xs text-muted">POS and inventory</p>
        </div>
      </div>

      <h1 className="mt-5 text-xl font-extrabold text-ink">Sign in</h1>
      <p className="mt-1 text-[15px] text-muted">Use the email and password the owner set up for you.</p>

      <form action={formAction} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            defaultValue={state.email}
            invalid={invalid}
            aria-describedby={invalid ? 'login-error' : undefined}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            invalid={invalid}
            aria-describedby={invalid ? 'login-error' : undefined}
          />
        </Field>
        {state.error && (
          <p id="login-error" className="text-sm font-medium text-bad" role="alert">
            {state.error}
          </p>
        )}
        <Button type="submit" variant="leaf" icon={LogIn} className="w-full" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
