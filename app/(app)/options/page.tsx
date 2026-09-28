import type { Metadata } from 'next';
import { RouteBlocked } from '@/components/shell/RouteScreen';
import { OptionsClient } from '@/components/options/options-client';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Options') } };

export default async function OptionsPage() {
  const access = await requireRoute('options');
  if (access.status !== 'ok') return <RouteBlocked id="options" access={access} />;

  return <OptionsClient />;
}
