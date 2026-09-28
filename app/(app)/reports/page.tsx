import type { Metadata } from 'next';
import { RouteBlocked, RouteScreen } from '@/components/shell/RouteScreen';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Reports') } };

export default async function ReportsPage() {
  const access = await requireRoute('reports');
  if (access.status !== 'ok') return <RouteBlocked id="reports" access={access} />;

  return (
    <RouteScreen id="reports" access={access} description="Completed sales only. Voided receipts are left out.">
      Daily, weekly, monthly and yearly sales: KPIs, trend, payment-method and cashier splits, top products and packages, and top
      leaders and uplines, per branch or across both.
    </RouteScreen>
  );
}
