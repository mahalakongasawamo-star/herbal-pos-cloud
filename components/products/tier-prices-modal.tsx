'use client';

// Per-tier price override modal, opened from Product master's "Tier prices"
// column. Ported from legacy-vite-app/src/modules/ProductMaster.jsx's
// TierPricesModal. Always replaces the product's whole tierPrices map on
// save (clearing a field removes that tier's override) — same contract as
// lib/data/products.ts's updateProduct.
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MoneyInput } from '@/components/product-form/product-form';
import { resolveUnitPrice } from '@/lib/pricing';
import { parseMoney, peso, round2 } from '@/lib/format';
import { updateProduct } from '@/lib/data/products';
import { Button, Field, Modal, useToast } from '@/components/ui';
import type { MemberTier, Product } from '@/lib/types';

export interface TierPricesModalProps {
  product: Product;
  memberTiers: MemberTier[];
  supabase: SupabaseClient;
  onSaved: () => void;
  onClose: () => void;
}

export function TierPricesModal({ product, memberTiers, supabase, onSaved, onClose }: TierPricesModalProps) {
  const toast = useToast();
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(memberTiers.map((t) => [t.name, product.tierPrices?.[t.name] ? String(product.tierPrices[t.name]) : ''])),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const tierPrices: Record<string, number> = {};
    for (const t of memberTiers) {
      const v = parseMoney(vals[t.name]);
      if (v > 0) tierPrices[t.name] = round2(v);
    }
    setSaving(true);
    try {
      await updateProduct(supabase, product.id, product.isPackage, { tierPrices });
      toast({ title: 'Tier prices saved', message: product.name });
      onSaved();
      onClose();
    } catch (err) {
      toast({ tone: 'bad', title: 'Could not save tier prices', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Tier prices: ${product.name}`}
      description="Optional. A tier price overrides the member price for that tier only."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="leaf" onClick={save} disabled={saving}>
            Save tier prices
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {memberTiers.map((t) => {
          const fallback = resolveUnitPrice({ ...product, tierPrices: {} }, { customerTier: 'Member', memberTier: t.name, tiers: memberTiers });
          return (
            <Field key={t.name} label={t.name} htmlFor={`tp-${t.name}`} hint={`If blank: ${peso(fallback.unit)} (${fallback.rule.toLowerCase()})`}>
              <MoneyInput id={`tp-${t.name}`} value={vals[t.name]} onChange={(v) => setVals((x) => ({ ...x, [t.name]: v }))} />
            </Field>
          );
        })}
      </div>
    </Modal>
  );
}
