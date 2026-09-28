import type { Metadata } from 'next';
import { RouteBlocked } from '@/components/shell/RouteScreen';
import { PosClient } from '@/components/pos/pos-client';
import { requireRoute } from '@/lib/auth';
import { pageTitle } from '@/lib/nav';

export const metadata: Metadata = { title: { absolute: pageTitle('Point of sale') } };

export default async function PosPage() {
  const access = await requireRoute('pos');
  if (access.status !== 'ok') return <RouteBlocked id="pos" access={access} />;

  return (
    <div className="h-full">
      <PosClient profile={access.profile} />
    </div>
  );
}
