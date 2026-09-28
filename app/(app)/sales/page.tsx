import type { Metadata } from 'next';
import { RouteBlocked } from '@/components/shell/RouteScreen';
import { SalesLogClient } from '@/components/sales/sales-log-client';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Sales log') } };

export default async function SalesLogPage() {
  const access = await requireRoute('sales');
  if (access.status !== 'ok') return <RouteBlocked id="sales" access={access} />;

  return <SalesLogClient profile={access.profile} />;
}
