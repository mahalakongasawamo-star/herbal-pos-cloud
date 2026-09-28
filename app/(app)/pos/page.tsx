import type { Metadata } from 'next';
import { RouteBlocked, RouteScreen } from '@/components/shell/RouteScreen';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Point of sale') } };

export default async function PosPage() {
  const access = await requireRoute('pos');
  if (access.status !== 'ok') return <RouteBlocked id="pos" access={access} />;

  return (
    // The Vite app's POS screen has no PageHeader; this line is new.
    <RouteScreen id="pos" access={access} description="Ring up a sale, take payment and print the receipt.">
      The register: customer profile, a catalog showing your branch’s live stock, member pricing, package deduction, then save and
      print. Each sale is one server-side transaction with a server-issued receipt number.
    </RouteScreen>
  );
}
