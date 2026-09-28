'use client';

// Ported from legacy-vite-app/src/modules/AddStock.jsx's ReceiveForm (SPEC
// §10 — minimal-change port). Deviation: legacy attached the same `note`
// text to the (only) ledger entry; here it's passed as the stock_ins
// batch-level note (lib/types.ts's StockIn.note is one string per batch),
// so entries carry no per-line note.
import { useState } from 'react';
import { PackagePlus } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useCatalog } from '@/components/providers/catalog-provider';
import { useLiveStock } from '@/lib/hooks/use-live-stock';
import { cleanSku, int, isoDay, norm } from '@/lib/format';
import { Button, Field, Input, Panel, Select, useToast } from '@/components/ui';
import { receiveStock } from '@/lib/rpc/receive-stock';
import { RpcError } from '@/lib/rpc/errors';

const NEW_CAT = '__new__';

export function ReceiveForm({ supabase, branchId, onReceived }: { supabase: SupabaseClient; branchId: string | null; onReceived: () => void }) {
  const { products, categories } = useCatalog();
  const stock = useLiveStock();
  const toast = useToast();
  const [date, setDate] = useState(isoDay());
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const stockables = products.filter((p) => !p.isPackage);
  const code = cleanSku(sku);
  const existing = products.find((p) => p.sku === code);
  const isNew = !!code && !existing;
  const productCats = categories.filter((c) => !c.isPackage).map((c) => c.name);
  const chosenCategory = category === NEW_CAT ? norm(newCategory) : category;
  const qtyNum = Number(qty);
  const current = existing && !existing.isPackage && branchId ? stock.onHand(branchId, existing.id) : 0;

  const errors: Record<string, string> = {};
  if (!branchId) errors.branch = 'Choose which branch this stock is for.';
  if (!date) errors.date = 'Choose the date received.';
  if (!code) errors.sku = 'Choose a SKU or type a new one.';
  else if (existing?.isPackage) errors.sku = 'Packages aren’t stocked. Receive the items they contain instead.';
  if (isNew && !norm(name)) errors.name = 'Name the new product.';
  if (isNew && !chosenCategory) errors.category = 'Choose a category.';
  if (!(Number.isInteger(qtyNum) && qtyNum >= 1)) errors.qty = 'Enter a whole number, 1 or more.';
  const show = (k: string) => (tried ? errors[k] : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length || saving) return;
    setSaving(true);
    try {
      const newProducts = isNew ? [{ sku: code, name: norm(name), category: chosenCategory, isPackage: false, price: 0, memberPrice: 0, reorderLevel: 10 }] : [];
      await receiveStock(supabase, {
        branchId: branchId as string,
        entries: [{ sku: code, qty: qtyNum }],
        newProducts,
        stockDate: date,
        note: norm(note),
      });
      const label = existing ? existing.name : norm(name);
      toast({
        title: `Added ${int(qtyNum)} × ${label}`,
        message: isNew ? 'New product registered with no price yet. Set it in Product master.' : `On hand is now ${int(current + qtyNum)}.`,
      });
      onReceived();
      setTried(false);
      setSku('');
      setQty('');
      setNote('');
      setName('');
      setCategory('');
      setNewCategory('');
    } catch (err) {
      const message = err instanceof RpcError ? err.message : 'Check the connection and try again — nothing was lost.';
      toast({ tone: 'bad', title: 'Stock not added', message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Receive stock" description="Pick an existing SKU, or type a new one to register the product as you receive it.">
      <form onSubmit={submit} noValidate className="grid gap-4 lg:grid-cols-6">
        <Field label="Date received" htmlFor="rs-date" required error={show('date')} className="lg:col-span-2">
          <Input id="rs-date" type="date" value={date} max={isoDay()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field
          label="SKU"
          htmlFor="rs-sku"
          required
          error={show('sku')}
          className="lg:col-span-2"
          hint={isNew ? 'New SKU: this registers a new product.' : existing ? `On hand: ${int(current)}` : 'Start typing to pick from the list.'}
        >
          <Input
            id="rs-sku"
            list="rs-skus"
            value={sku}
            invalid={!!show('sku')}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
            className="font-mono uppercase"
            placeholder="e.g. OC-MAH"
            autoComplete="off"
          />
          <datalist id="rs-skus">
            {stockables.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.name}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Qty in" htmlFor="rs-qty" required error={show('qty')} className="lg:col-span-2">
          <Input id="rs-qty" inputMode="numeric" className="num" value={qty} invalid={!!show('qty')} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} placeholder="0" />
        </Field>

        {existing && !existing.isPackage ? (
          <>
            <Field label="Category" htmlFor="rs-cat-ro" className="lg:col-span-2">
              <Input id="rs-cat-ro" value={existing.category} readOnly />
            </Field>
            <Field label="Product name" htmlFor="rs-name-ro" className="lg:col-span-4">
              <Input id="rs-name-ro" value={existing.name} readOnly />
            </Field>
          </>
        ) : (
          <>
            <Field label="Category" htmlFor="rs-cat" required={isNew} error={show('category')} className="lg:col-span-2">
              <Select id="rs-cat" value={category} disabled={!isNew} invalid={!!show('category')} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{isNew ? 'Choose a category' : 'Filled from the SKU'}</option>
                {productCats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={NEW_CAT}>New category…</option>
              </Select>
            </Field>
            {category === NEW_CAT && (
              <Field label="New category name" htmlFor="rs-newcat" required className="lg:col-span-2">
                <Input id="rs-newcat" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              </Field>
            )}
            <Field label="Product name" htmlFor="rs-name" required={isNew} error={show('name')} className={category === NEW_CAT ? 'lg:col-span-2' : 'lg:col-span-4'}>
              <Input id="rs-name" value={name} disabled={!isNew} invalid={!!show('name')} placeholder={isNew ? 'Name of the new product' : 'Filled from the SKU'} onChange={(e) => setName(e.target.value)} />
            </Field>
          </>
        )}

        <Field label="Note" htmlFor="rs-note" hint="Optional: supplier, delivery receipt no., batch." className="lg:col-span-4">
          <Input id="rs-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex items-end lg:col-span-2">
          <Button type="submit" variant="leaf" icon={PackagePlus} className="w-full" disabled={saving}>
            {saving ? 'Adding…' : 'Add to stock'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
