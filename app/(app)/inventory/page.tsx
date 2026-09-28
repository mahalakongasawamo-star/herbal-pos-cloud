import type { Metadata } from 'next';
import { RouteBlocked } from '@/components/shell/RouteScreen';
import { InventoryClient } from '@/components/inventory/inventory-client';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Inventory') } };

export default async function InventoryPage() {
  const access = await requireRoute('inventory');
  if (access.status !== 'ok') return <RouteBlocked id="inventory" access={access} />;

  return <InventoryClient profile={access.profile} />;
}
