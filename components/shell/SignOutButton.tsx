'use client';

import { useFormStatus } from 'react-dom';
import { LogOut } from 'lucide-react';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui';
import { signOut } from './actions';

interface SignOutButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon only below the sm breakpoint (header on phones). */
  compact?: boolean;
  className?: string;
}

/** A form posting to the signOut Server Action; works before hydration too. */
export function SignOutButton({ variant = 'ghost', size = 'sm', compact = false, className }: SignOutButtonProps) {
  return (
    <form action={signOut} className={className}>
      <SubmitButton variant={variant} size={size} compact={compact} />
    </form>
  );
}

function SubmitButton({ variant, size, compact }: Required<Omit<SignOutButtonProps, 'className'>>) {
  const { pending } = useFormStatus();
  const label = pending ? 'Signing out…' : 'Sign out';
  return (
    <Button type="submit" variant={variant} size={size} icon={LogOut} disabled={pending} aria-label={compact ? label : undefined}>
      <span className={compact ? 'hidden sm:inline' : undefined}>{label}</span>
    </Button>
  );
}
