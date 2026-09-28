import type { Metadata } from 'next';
import { RouteBlocked, RouteScreen } from '@/components/shell/RouteScreen';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Inventory') } };

export default async function InventoryPage() {
  const access = await requireRoute('inventory');
  if (access.status !== 'ok') return <RouteBlocked id="inventory" access={access} />;

  return (
    <RouteScreen
      id="inventory"
      access={access}
      description="Current stock = quantity added − quantity sold. Package sales deduct their contents here."
    >
      Stock on hand per branch with in / low / out status, sorting and CSV export, updating live as either branch sells or receives.
      Cashiers get a read-only view.
    </RouteScreen>
  );
}
