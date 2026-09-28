import type { Metadata } from 'next';
import { RouteBlocked } from '@/components/shell/RouteScreen';
import { ProductsClient } from '@/components/products/products-client';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Product master') } };

export default async function ProductMasterPage() {
  const access = await requireRoute('products');
  if (access.status !== 'ok') return <RouteBlocked id="products" access={access} />;

  return <ProductsClient />;
}
