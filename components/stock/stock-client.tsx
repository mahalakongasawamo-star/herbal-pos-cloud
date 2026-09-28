'use client';

// Ported from legacy-vite-app/src/modules/AddStock.jsx (SPEC §10). Adds a
// branch context (SPEC's Add Stock never had one — legacy had one pooled
// stock number) since stock is now per branch (golden rule #6): a
// single-branch cashier/manager has no picker, an owner or all-branch
// manager gets a Select, matching the pattern in pos-client.tsx's
// TransactionBar.
import { useMemo, useState } from 'react';
import { MapPin, PackagePlus } from 'lucide-react';
import { useCatalog } from '@/components/providers/catalog-provider';
import { createClient } from '@/lib/supabase/client';
import { navItem } from '@/lib/nav';
import { PageHeader, Segmented, Select } from '@/components/ui';
import type { Profile } from '@/lib/auth';
import { ReceiveForm } from './receive-form';
import { BulkReceive } from './bulk-receive';
import { RegisterProduct } from './register-product';
import { StockHistory } from './stock-history';

type Tab = 'single' | 'bulk' | 'register';
const TABS: { value: Tab; label: string }[] = [
  { value: 'single', label: 'Receive stock' },
  { value: 'bulk', label: 'Bulk receive' },
  { value: 'register', label: 'Register new product' },
];

export function StockClient({ profile }: { profile: Profile }) {
  const { branches } = useCatalog();
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>('single');
  const [chosenBranch, setChosenBranch] = useState<string | null>(null);
  // Bumped after any successful receive/register/undo, so StockHistory
  // reloads even though it has no realtime subscription of its own.
  const [refreshKey, setRefreshKey] = useState(0);
  const onReceived = () => setRefreshKey((k) => k + 1);

  const fixedBranch = profile.branch_id;
  const branchId = fixedBranch ?? chosenBranch ?? branches[0]?.id ?? null;

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <PageHeader
        title={navItem('stock').title}
        description="Record deliveries and opening balances. Each entry adds to the product’s quantity on hand."
        actions={
          !fixedBranch && (
            <div className="min-w-[200px]">
              <label htmlFor="stock-branch" className="text-xs font-semibold text-muted">
                Branch
              </label>
              <div className="relative mt-0.5">
                <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-leaf" aria-hidden="true" />
                <Select id="stock-branch" value={branchId ?? ''} onChange={(e) => setChosenBranch(e.target.value)} className="h-10 pl-9 font-semibold sm:w-56">
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )
        }
      />
      {!branchId && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-warn/40 bg-warn-soft px-3 py-2.5 text-sm font-semibold text-ink">
          <PackagePlus size={16} className="shrink-0" aria-hidden="true" />
          Choose a branch above to receive stock and see live history.
        </div>
      )}
      <Segmented ariaLabel="Add stock mode" value={tab} onChange={setTab} options={TABS} className="mb-4" />
      {tab === 'single' && <ReceiveForm supabase={supabase} branchId={branchId} onReceived={onReceived} />}
      {tab === 'bulk' && <BulkReceive supabase={supabase} branchId={branchId} onReceived={onReceived} />}
      {tab === 'register' && <RegisterProduct supabase={supabase} branchId={branchId} onReceived={onReceived} />}
      <StockHistory supabase={supabase} branchId={branchId} refreshKey={refreshKey} />
    </div>
  );
}
