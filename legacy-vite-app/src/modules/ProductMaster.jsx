import React, { useEffect, useMemo, useState } from 'react';
import { Info, Pencil, Plus, Search, Tags, TriangleAlert } from 'lucide-react';
import { useApp } from '../lib/context';
import { indexProducts, resolveUnitPrice } from '../lib/pricing';
import { int, isoDay, parseMoney, peso, pct, round2 } from '../lib/format';
import { MoneyInput, ProductForm } from '../components/ProductForm';
import { Button, CategoryDot, EmptyState, Field, IconButton, Input, Modal, PageHeader, Pill, Select, Sku, Toggle, cx, useToast } from '../components/ui';

/** Number cell that commits on Enter or blur; Escape reverts. */
function NumberCell({ value, onCommit, label, integer, emptyHint }) {
  const show = (v) => (integer ? String(v ?? 0) : Number(v) > 0 ? round2(v).toFixed(2) : '');
  const [text, setText] = useState(show(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(show(value));
  }, [value, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    setEditing(false);
    const n = integer ? (text === '' ? 0 : Number(text)) : text === '' ? 0 : parseMoney(text);
    if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) {
      setText(show(value));
      return;
    }
    if (n !== Number(value || 0)) onCommit(integer ? n : round2(n));
    setText(show(n));
  };
  const unset = !integer && !(Number(value) > 0);
  return (
    <input
      aria-label={label}
      inputMode={integer ? 'numeric' : 'decimal'}
      className={cx(
        'num h-9 w-full min-w-[84px] rounded-lg border px-2 text-right font-semibold text-ink placeholder:font-normal focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/30',
        unset && emptyHint ? 'border-turmeric/60 bg-turmeric-soft placeholder:text-turmeric-ink/70' : 'border-line-strong bg-surface placeholder:text-muted',
      )}
      value={text}
      placeholder={emptyHint || (integer ? '0' : '—')}
      onFocus={(e) => {
        setEditing(true);
        e.target.select();
      }}
      onChange={(e) => setText(integer ? e.target.value.replace(/\D/g, '') : e.target.value.replace(/[^\d.,]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(show(value));
          setEditing(false);
          setTimeout(() => e.target.blur(), 0);
        }
      }}
    />
  );
}

function TierPricesModal({ product, onClose }) {
  const { data, dispatch } = useApp();
  const toast = useToast();
  const tiers = data.options.memberTiers;
  const [vals, setVals] = useState(() => Object.fromEntries(tiers.map((t) => [t.name, product.tierPrices?.[t.name] ? String(product.tierPrices[t.name]) : ''])));
  const save = () => {
    const tierPrices = {};
    for (const t of tiers) {
      const v = parseMoney(vals[t.name]);
      if (v > 0) tierPrices[t.name] = round2(v);
    }
    dispatch({ type: 'UPDATE_PRODUCT', sku: product.sku, patch: { tierPrices } });
    toast({ title: 'Tier prices saved', message: product.name });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Tier prices: ${product.name}`}
      description="Optional. A tier price overrides the member price for that tier only."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="leaf" onClick={save}>
            Save tier prices
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {tiers.map((t) => {
          const fallback = resolveUnitPrice({ ...product, tierPrices: {} }, { customerTier: 'Member', memberTier: t.name, tiers });
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

export default function ProductMaster() {
  const { data, dispatch, go } = useApp();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState(null); // product or 'new'
  const [tierFor, setTierFor] = useState(null);
  const bySku = useMemo(() => indexProducts(data.products), [data.products]);
  const catIndex = useMemo(() => Object.fromEntries(data.categories.map((c, i) => [c.name, i])), [data.categories]);

  const all = data.products.filter((p) => archived || p.active !== false);
  const unpriced = data.products.filter((p) => p.active !== false && !(p.price > 0)).length;
  const qk = q.trim().toLowerCase();
  const rows = all
    .filter((p) => (cat === 'All' || p.category === cat) && (!qk || p.name.toLowerCase().includes(qk) || p.sku.toLowerCase().includes(qk)))
    .sort((a, b) => (catIndex[a.category] ?? 99) - (catIndex[b.category] ?? 99) || a.name.localeCompare(b.name));
  const cats = data.categories.filter((c) => data.products.some((p) => p.category === c.name));

  const patch = (sku, p, msg) => {
    dispatch({ type: 'UPDATE_PRODUCT', sku, patch: p });
    if (msg) toast({ title: msg });
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
            <li>the product’s tier price for the member’s tier,</li>
            <li>the product’s member price,</li>
            <li>the retail price less the tier’s discount % (set in Options).</li>
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
            Current tier discounts:{' '}
            {data.options.memberTiers.map((t) => `${t.name} ${pct(t.discountPct)}`).join(', ')}.{' '}
            <button type="button" className="font-semibold text-leaf underline-offset-2 hover:underline" onClick={() => go('options')}>
              Change in Options
            </button>
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
                    <tr key={p.sku} className={cx('border-t border-line align-middle', p.active === false && 'bg-sunken/60 text-muted')}>
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
                        <NumberCell label={`Retail price of ${p.name}`} value={p.price} emptyHint="Set price" onCommit={(v) => patch(p.sku, { price: v }, `${p.name}: retail ${peso(v)}`)} />
                      </td>
                      <td className="px-2 py-2">
                        <NumberCell label={`Member price of ${p.name}`} value={p.memberPrice} onCommit={(v) => patch(p.sku, { memberPrice: v }, `${p.name}: member ${v > 0 ? peso(v) : 'price cleared'}`)} />
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
                          <span className="block pr-2 text-right text-muted">—</span>
                        ) : (
                          <NumberCell integer label={`Reorder level of ${p.name}`} value={p.reorderLevel} onCommit={(v) => patch(p.sku, { reorderLevel: v }, `${p.name}: reorder at ${int(v)}`)} />
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
                          <Toggle checked={p.active !== false} label={`${p.name} available in POS`} onChange={(on) => patch(p.sku, { active: on }, on ? `${p.name} is back in the POS` : `${p.name} archived`)} />
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
            onSubmit={(product, { openingStock }) => {
              if (editing === 'new') {
                dispatch({
                  type: 'RECEIVE_STOCK',
                  newProducts: [product],
                  entries: openingStock > 0 ? [{ sku: product.sku, qty: openingStock, date: isoDay(), note: 'Opening stock' }] : [],
                });
                toast({ title: `${product.name} added`, message: product.isPackage ? 'Package ready to sell.' : 'Add stock when it arrives.' });
              } else {
                const { sku, ...rest } = product;
                dispatch({ type: 'UPDATE_PRODUCT', sku: editing.sku, patch: rest });
                toast({ title: 'Changes saved', message: product.name });
              }
              setEditing(null);
            }}
          />
        </Modal>
      )}
      {tierFor && <TierPricesModal product={bySku[tierFor.sku] || tierFor} onClose={() => setTierFor(null)} />}
    </div>
  );
}
