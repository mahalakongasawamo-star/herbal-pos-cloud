import type { Metadata } from 'next';
import { RouteBlocked } from '@/components/shell/RouteScreen';
import { ReportsClient } from '@/components/reports/reports-client';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Reports') } };

export default async function ReportsPage() {
  const access = await requireRoute('reports');
  if (access.status !== 'ok') return <RouteBlocked id="reports" access={access} />;

  return <ReportsClient profile={access.profile} />;
}
