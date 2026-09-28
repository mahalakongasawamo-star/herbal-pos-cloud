import type { Metadata } from 'next';
import { RouteBlocked, RouteScreen } from '@/components/shell/RouteScreen';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Sales log') } };

export default async function SalesLogPage() {
  const access = await requireRoute('sales');
  if (access.status !== 'ok') return <RouteBlocked id="sales" access={access} />;

  return (
    <RouteScreen id="sales" access={access} description="Every saved transaction, newest first. Open one to reprint or void it.">
      Every sale in your branch scope, newest first: search, filter by cashier and date, reprint, or void with a reason. Updates live
      when another till saves a sale.
    </RouteScreen>
  );
}
