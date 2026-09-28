// Full-screen cards the (app) layout shows instead of the shell. Same card as
// the Vite app's LockScreen / ErrorBoundary (rounded-2xl border bg-surface p-6).

import type { ReactNode } from 'react';
import { CloudOff, UserX } from 'lucide-react';
import { ReloadButton } from './ReloadButton';
import { SignOutButton } from './SignOutButton';

function CenteredCard({ icon, title, children, actions }: { icon: ReactNode; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
        {icon}
        <h1 className="mt-3 text-xl font-extrabold text-ink">{title}</h1>
        <div className="mt-2 text-[15px] text-muted">{children}</div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

/** Signed in, but there's no active profile for this account. */
export function NoAccessCard({ email }: { email: string | null }) {
  return (
    <CenteredCard
      icon={<UserX size={30} className="mx-auto text-leaf" aria-hidden="true" />}
      title="No access"
      actions={<SignOutButton variant="leaf" size="md" />}
    >
      <p>Your account isn’t set up for this POS yet — ask the owner.</p>
      {email && (
        <p className="mt-2 text-sm">
          Signed in as <span className="font-semibold text-ink-2">{email}</span>
        </p>
      )}
    </CenteredCard>
  );
}

/** Supabase couldn't be reached (or errored) while checking the account. */
export function UnavailableCard({ message }: { message: string }) {
  return (
    <CenteredCard
      icon={<CloudOff size={30} className="mx-auto text-leaf" aria-hidden="true" />}
      title="Can’t reach the server"
      actions={
        <>
          <ReloadButton />
          <SignOutButton variant="secondary" size="md" />
        </>
      }
    >
      <p>The POS couldn’t check your account just now. Check the connection, then try again.</p>
      <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-sunken p-3 text-left text-xs text-muted">{message}</pre>
    </CenteredCard>
  );
}
