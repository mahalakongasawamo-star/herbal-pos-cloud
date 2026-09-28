'use client';

// Product master (SPEC §1 Phase 1, owner-only per SPEC §2 — the page has
// already gated non-owners via requireRoute('products') before this
// mounts). Ported from legacy-vite-app/src/modules/ProductMaster.jsx
// (SPEC §10 — layout/interaction carried over near-verbatim).
//
// Deviations from legacy, all required by the move off a single in-memory
// reducer onto Supabase:
//   - Every write (price/member-price/reorder-level cell commit, active
//     toggle, tier-price save, create, edit) is its own async call into
//     lib/data/products.ts or lib/rpc/receive-stock.ts, followed by
//     catalog.refetch() so this client sees its own write immediately
//     (realtime should also catch it, but refetch is faster/more reliable
//     for the writer's own change per the catalog provider's own doc comment).
//   - "How member pricing works" panel's legacy `go('options')` callback
//     doesn't exist here; replaced with a next/link to /options.
//   - Creating a product with opening stock now needs a branch (this app is
//     multi-branch; legacy wasn't) — see components/product-form/product-form.tsx's
//     header comment for that decision.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Info, Pencil, Plus, Search, Tags, TriangleAlert } from 'lucide-react';
import { useCatalog } from '@/components/providers/catalog-provider';
import { createClient } from '@/lib/supabase/client';
import { updateProduct, type ProductPatch } from '@/lib/data/products';
import { receiveStock } from '@/lib/rpc/receive-stock';
import { int, peso, pct } from '@/lib/format';
import {
  Button,
  CategoryDot,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Pill,
  Select,
  Sku,
  Toggle,
  cx,
  useToast,
} from '@/components/ui';
import { NumberCell } from '@/components/products/number-cell';
import { TierPricesModal } from '@/components/products/tier-prices-modal';
import { ProductForm, type ProductDraft, type ProductFormSubmitOptions } from '@/components/product-form/product-form';
import type { Product } from '@/lib/types';

type Editing = null | 'new' | Product;

export function ProductsClient() {
  const { categories, products, memberTiers, refetch } = useCatalog();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [tierFor, setTierFor] = useState<Product | null>(null);

  const bySku = useMemo(() => Object.fromEntries(products.map((p) => [p.sku, p])), [products]);
  const catIndex = useMemo(() => Object.fromEntries(categories.map((c, i) => [c.name, i])), [categories]);

  const all = products.filter((p) => archived || p.active !== false);
  const unpriced = products.filter((p) => p.active !== false && !(p.price > 0)).length;
  const qk = q.trim().toLowerCase();
  const rows = all
    .filter((p) => (cat === 'All' || p.category === cat) && (!qk || p.name.toLowerCase().includes(qk) || p.sku.toLowerCase().includes(qk)))
    .sort((a, b) => (catIndex[a.category] ?? 99) - (catIndex[b.category] ?? 99) || a.name.localeCompare(b.name));
  const cats = categories.filter((c) => products.some((p) => p.category === c.name));

  const commit = async (product: Product, patch: ProductPatch, msg: string) => {
    try {
      await updateProduct(supabase, product.id, product.isPackage, patch);
      await refetch();
      toast({ title: msg });
    } catch (err) {
      toast({ tone: 'bad', title: 'Could not save', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleCreate = async (draft: ProductDraft, opts: ProductFormSubmitOptions) => {
    try {
      await receiveStock(supabase, {
        branchId: opts.branchId,
        newProducts: [
          {
            sku: draft.sku,
            name: draft.name,
            category: draft.category,
            isPackage: draft.isPackage,
            price: draft.price,
            memberPrice: draft.memberPrice,
            reorderLevel: draft.reorderLevel,
            inclusions: draft.isPackage ? draft.inclusions : undefined,
          },
        ],
        entries: opts.openingStock > 0 ? [{ sku: draft.sku, qty: opts.openingStock, note: 'Opening stock' }] : [],
      });
      await refetch();
      toast({ title: `${draft.name} added`, message: draft.isPackage ? 'Package ready to sell.' : 'Add stock when it arrives.' });
      setEditing(null);
    } catch (err) {
      toast({ tone: 'bad', title: 'Could not add product', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleEdit = async (original: Product, draft: ProductDraft) => {
    try {
      const inclusions = draft.isPackage
        ? draft.inclusions.map((i) => ({ productId: bySku[i.sku]?.id, qty: i.qty })).filter((i): i is { productId: string; qty: number } => !!i.productId)
        : undefined;
      await updateProduct(supabase, original.id, original.isPackage, {
        name: draft.name,
        category: draft.category,
        price: draft.price,
        memberPrice: draft.memberPrice,
        reorderLevel: draft.reorderLevel,
        inclusions,
      });
      await refetch();
      toast({ title: 'Changes saved', message: draft.name });
      setEditing(null);
    } catch (err) {
      toast({ tone: 'bad', title: 'Could not save', message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <PageHeader
        title="Product master"
        description="Set prices, reorder levels and package contents. Changes apply to new sales right away; saved receipts keep their prices."
        actions={
          <Button variant="leaf" icon={Plus} onClick={() => setEditing('new')}>
            Add product
          </Button>
        }
      />

      <details className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 sm:px-5" open={unpriced > 0}>
        <summary className="flex cursor-pointer items-center gap-2 font-bold text-ink">
          <Info size={18} className="text-leaf" aria-hidden="true" /> How member pricing works
        </summary>
        <div className="mt-2 max-w-[80ch] space-y-1.5 text-sm text-ink-2">
          <p>New customers pay the retail price. For members, the POS uses the first of these that is set:</p>
          <ol className="list-decimal space-y-0.5 pl-5">
            <li>the product&rsquo;s tier price for the member&rsquo;s tier,</li>
            <li>the product&rsquo;s member price,</li>
            <li>the retail price less the tier&rsquo;s discount % (set in Options).</li>
          </ol>
          <p>
            The difference from retail shows as the member discount on the order and receipt.
            {unpriced > 0 && (
              <>
                {' '}
                <strong className="text-ink">{int(unpriced)} products have no retail price yet</strong>; the highlighted cells need one.
              </>
            )}
          </p>
          <p>
            Current tier discounts: {memberTiers.map((t) => `${t.name} ${pct(t.discountPct)}`).join(', ')}.{' '}
            <Link href="/options" className="font-semibold text-leaf underline-offset-2 hover:underline">
              Change in Options
            </Link>
          </p>
        </div>
      </details>

      <section className="rounded-2xl border border-line bg-surface">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:px-5">
          <Field label="Search" htmlFor="pm-q">
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <Input id="pm-q" type="search" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name or SKU" />
            </div>
          </Field>
          <Field label="Category" htmlFor="pm-cat">
            <Select id="pm-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="All">All categories</option>
              {cats.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-3 pb-2.5">
            <Toggle id="pm-arch" checked={archived} onChange={setArchived} label="Show archived products" />
            <label htmlFor="pm-arch" className="text-sm font-semibold text-ink-2">
              Show archived
            </label>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Tags} title="No products match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] text-sm">
              <thead>
                <tr className="bg-sunken text-left text-xs font-semibold text-muted">
                  <th scope="col" className="px-4 py-2.5 sm:px-5">Product</th>
                  <th scope="col" className="px-3 py-2.5">Category</th>
                  <th scope="col" className="w-[130px] px-2 py-2.5 text-right">Retail price</th>
                  <th scope="col" className="w-[130px] px-2 py-2.5 text-right">Member price</th>
                  <th scope="col" className="px-3 py-2.5">Tier prices</th>
                  <th scope="col" className="w-[110px] px-2 py-2.5 text-right">Reorder level</th>
                  <th scope="col" className="px-3 py-2.5">Contents</th>
                  <th scope="col" className="px-3 py-2.5">Sold in POS</th>
                  <th scope="col" className="px-4 py-2.5 text-right sm:px-5">
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const tierCount = Object.keys(p.tierPrices || {}).length;
                  const memberAbove = p.memberPrice > 0 && p.price > 0 && p.memberPrice > p.price;
                  return (
                    <tr key={p.id} className={cx('border-t border-line align-middle', p.active === false && 'bg-sunken/60 text-muted')}>
                      <td className="px-4 py-2 sm:px-5">
                        <p className="font-semibold text-ink">{p.name}</p>
                        <Sku>{p.sku}</Sku>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="inline-flex items-center gap-2">
                          <CategoryDot category={p.category} />
                          {p.category}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <NumberCell label={`Retail price of ${p.name}`} value={p.price} emptyHint="Set price" onCommit={(v) => commit(p, { price: v }, `${p.name}: retail ${peso(v)}`)} />
                      </td>
                      <td className="px-2 py-2">
                        <NumberCell
                          label={`Member price of ${p.name}`}
                          value={p.memberPrice}
                          onCommit={(v) => commit(p, { memberPrice: v }, `${p.name}: member ${v > 0 ? peso(v) : 'price cleared'}`)}
                        />
                        {memberAbove && (
                          <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-semibold text-warn">
                            <TriangleAlert size={12} aria-hidden="true" /> Above retail
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Button size="sm" variant="ghost" onClick={() => setTierFor(p)} className="px-2">
                          {tierCount ? `${int(tierCount)} set` : 'Set'}
                        </Button>
                      </td>
                      <td className="px-2 py-2">
                        {p.isPackage ? (
                          <span className="block pr-2 text-right text-muted">&mdash;</span>
                        ) : (
                          <NumberCell integer label={`Reorder level of ${p.name}`} value={p.reorderLevel} onCommit={(v) => commit(p, { reorderLevel: v }, `${p.name}: reorder at ${int(v)}`)} />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.isPackage ? (
                          <button type="button" className="text-left font-semibold text-leaf hover:underline" onClick={() => setEditing(p)}>
                            {p.inclusions.length ? p.inclusions.map((i) => `${i.qty}× ${bySku[i.sku]?.name || i.sku}`).join(', ') : 'Add contents'}
                          </button>
                        ) : (
                          <span className="text-muted">Stock item</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-2">
                          <Toggle
                            checked={p.active !== false}
                            label={`${p.name} available in POS`}
                            onChange={(on) => commit(p, { active: on }, on ? `${p.name} is back in the POS` : `${p.name} archived`)}
                          />
                          {p.active === false && <Pill>Archived</Pill>}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right sm:px-5">
                        <IconButton icon={Pencil} label={`Edit ${p.name}`} onClick={() => setEditing(p)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-3 text-sm text-muted">Prices: type a value and press Enter or Tab to save. Esc undoes the edit.</p>

      {editing && (
        <Modal open onClose={() => setEditing(null)} size="lg" title={editing === 'new' ? 'Add product' : `Edit ${editing.name}`}>
          <ProductForm
            mode={editing === 'new' ? 'create' : 'edit'}
            initial={editing === 'new' ? undefined : editing}
            allowOpeningStock={editing === 'new'}
            onCancel={() => setEditing(null)}
            onSubmit={(draft, opts) => {
              if (editing === 'new') void handleCreate(draft, opts);
              else void handleEdit(editing, draft);
            }}
          />
        </Modal>
      )}
      {tierFor && (
        <TierPricesModal
          product={bySku[tierFor.sku] || tierFor}
          memberTiers={memberTiers}
          supabase={supabase}
          onSaved={refetch}
          onClose={() => setTierFor(null)}
        />
      )}
    </div>
  );
}
