import type { Metadata } from 'next';
import { RouteBlocked, RouteScreen } from '@/components/shell/RouteScreen';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Product master') } };

export default async function ProductMasterPage() {
  const access = await requireRoute('products');
  if (access.status !== 'ok') return <RouteBlocked id="products" access={access} />;

  return (
    <RouteScreen
      id="products"
      access={access}
      description="Set prices, reorder levels and package contents. Changes apply to new sales right away; saved receipts keep their prices."
    >
      Retail, member and per-tier prices, reorder levels, package contents and archiving for the catalog both branches sell from.
    </RouteScreen>
  );
}
