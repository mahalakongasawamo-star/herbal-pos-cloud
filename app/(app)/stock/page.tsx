import type { Metadata } from 'next';
import { RouteBlocked, RouteScreen } from '@/components/shell/RouteScreen';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Add stock') } };

export default async function AddStockPage() {
  const access = await requireRoute('stock');
  if (access.status !== 'ok') return <RouteBlocked id="stock" access={access} />;

  return (
    <RouteScreen id="stock" access={access} description="Record deliveries and opening balances. Each entry adds to the product’s quantity added.">
      Receive deliveries and opening balances into a branch, bulk receive, register new products, and reverse a receiving batch. Every
      entry is an append-only stock ledger row.
    </RouteScreen>
  );
}
