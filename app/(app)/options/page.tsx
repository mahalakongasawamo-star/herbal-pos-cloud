import type { Metadata } from 'next';
import { RouteBlocked, RouteScreen } from '@/components/shell/RouteScreen';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Options') } };

export default async function OptionsPage() {
  const access = await requireRoute('options');
  if (access.status !== 'ok') return <RouteBlocked id="options" access={access} />;

  return (
    <RouteScreen
      id="options"
      access={access}
      description="Store details, cashier stations, payment methods and member tiers. Changes save automatically."
    >
      Store and receipt details, logo and print layout, payment methods and member tiers. Staff sign-ins replace the old cashier
      station list.
    </RouteScreen>
  );
}
