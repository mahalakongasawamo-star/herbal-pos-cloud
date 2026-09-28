import type { Metadata } from 'next';
import { RouteBlocked } from '@/components/shell/RouteScreen';
import { StockClient } from '@/components/stock/stock-client';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Add stock') } };

export default async function AddStockPage() {
  const access = await requireRoute('stock');
  if (access.status !== 'ok') return <RouteBlocked id="stock" access={access} />;

  return <StockClient profile={access.profile} />;
}
