import type { Metadata } from 'next';
import { pageTitle, safeNextPath } from '@/lib/nav';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: { absolute: pageTitle('Sign in') } };

// Signed-in visitors never see this page: the proxy sends them to /pos.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams;
  const target = safeNextPath(Array.isArray(next) ? next[0] : next);

  return (
    <main id="main" className="flex h-full items-center justify-center p-6">
      <LoginForm next={target} />
    </main>
  );
}
