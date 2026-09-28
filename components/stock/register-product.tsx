'use client';

// Ported from legacy-vite-app/src/modules/AddStock.jsx's RegisterProduct
// (SPEC §10). Deviation from legacy: only the owner may set a price above
// ₱0 or create/fill a package (server-enforced, RpcError hint 'forbidden');
// a manager or cashier can still get here and try, so failure is turned
// into a specific, actionable toast instead of the generic RPC message.
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { int, isoDay } from '@/lib/format';
import { Panel, useToast } from '@/components/ui';
import { receiveStock } from '@/lib/rpc/receive-stock';
import { RpcError } from '@/lib/rpc/errors';
import { ProductForm, type ProductFormValue } from './product-form';

export function RegisterProduct({ supabase, branchId, onReceived }: { supabase: SupabaseClient; branchId: string | null; onReceived: () => void }) {
  const toast = useToast();
  const [key, setKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const submit = async (product: ProductFormValue, { openingStock }: { openingStock: number }) => {
    if (!branchId || saving) {
      if (!branchId) toast({ tone: 'bad', title: 'Choose a branch first', message: 'Pick which branch this product’s opening stock belongs to.' });
      return;
    }
    setSaving(true);
    try {
      await receiveStock(supabase, {
        branchId,
        newProducts: [product],
        entries: openingStock > 0 ? [{ sku: product.sku, qty: openingStock }] : [],
        stockDate: isoDay(),
        note: openingStock > 0 ? 'Opening stock' : '',
      });
      toast({ title: `${product.name} registered`, message: openingStock > 0 ? `Opening stock: ${int(openingStock)}.` : 'Add stock when it arrives.' });
      onReceived();
      setKey((k) => k + 1);
    } catch (err) {
      if (err instanceof RpcError && err.hint === 'forbidden') {
        const wantsPrice = product.price > 0 || product.memberPrice > 0;
        const message = product.isPackage
          ? 'Only the owner can create packages. Ask the owner to register this one.'
          : wantsPrice
            ? 'Only the owner can set prices — register it at ₱0 and ask the owner to price it.'
            : 'Only a manager or owner can register a new product.';
        toast({ tone: 'bad', title: 'Not registered', message });
      } else {
        const message = err instanceof RpcError ? err.message : 'Check the connection and try again — nothing was lost.';
        toast({ tone: 'bad', title: 'Not registered', message });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Register new product" description="Add a product or entry package to the catalog. You can set prices now or later in Product master.">
      <div className="max-w-3xl">
        <ProductForm key={key} allowOpeningStock submitLabel={saving ? 'Registering…' : 'Register product'} onSubmit={submit} />
      </div>
    </Panel>
  );
}
