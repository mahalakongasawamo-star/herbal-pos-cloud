import React, { useMemo, useState } from 'react';
import { History, PackagePlus, Undo2 } from 'lucide-react';
import { useApp } from '../lib/context';
import { onHand } from '../lib/pricing';
import { cleanSku, fmtDate, fmtDateTimeShort, int, isoDay, norm, parseDay } from '../lib/format';
import { ProductForm } from '../components/ProductForm';
import { Button, CategoryDot, EmptyState, Field, IconButton, Input, PageHeader, Panel, Pill, Segmented, Select, Sku, cx, useConfirm, useToast } from '../components/ui';

const TABS = [
  { value: 'single', label: 'Receive stock' },
  { value: 'bulk', label: 'Bulk receive' },
  { value: 'register', label: 'Register new product' },
];
const NEW_CAT = '__new__';

export default function AddStock() {
  const [tab, setTab] = useState('single');
  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <PageHeader title="Add stock" description="Record deliveries and opening balances. Each entry adds to the product’s quantity added." />
      <Segmented ariaLabel="Add stock mode" value={tab} onChange={setTab} options={TABS} className="mb-4" />
      {tab === 'single' && <ReceiveForm />}
      {tab === 'bulk' && <BulkReceive />}
      {tab === 'register' && <RegisterProduct />}
      <StockHistory />
    </div>
  );
}

// ------------------------------------------------------------ Single receive
function ReceiveForm() {
  const { data, dispatch } = useApp();
  const toast = useToast();
  const [date, setDate] = useState(isoDay());
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);

  const stockables = data.products.filter((p) => !p.isPackage);
  const code = cleanSku(sku);
  const existing = data.products.find((p) => p.sku === code);
  const isNew = !!code && !existing;
  const productCats = data.categories.filter((c) => !c.isPackage).map((c) => c.name);
  const chosenCategory = category === NEW_CAT ? norm(newCategory) : category;
  const qtyNum = Number(qty);
  const current = existing && !existing.isPackage ? onHand(data.stock[existing.sku]) : 0;

  const errors = {};
  if (!date) errors.date = 'Choose the date received.';
  if (!code) errors.sku = 'Choose a SKU or type a new one.';
  else if (existing?.isPackage) errors.sku = 'Packages aren’t stocked. Receive the items they contain instead.';
  if (isNew && !norm(name)) errors.name = 'Name the new product.';
  if (isNew && !chosenCategory) errors.category = 'Choose a category.';
  if (!(Number.isInteger(qtyNum) && qtyNum >= 1)) errors.qty = 'Enter a whole number, 1 or more.';
  const show = (k) => (tried ? errors[k] : undefined);

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) return;
    const newProducts = isNew ? [{ sku: code, name: norm(name), category: chosenCategory, isPackage: false, price: 0, memberPrice: 0, reorderLevel: 10 }] : [];
    dispatch({ type: 'RECEIVE_STOCK', entries: [{ date, sku: code, qty: qtyNum, note: norm(note) }], newProducts });
    const label = existing ? existing.name : norm(name);
    toast({
      title: `Added ${int(qtyNum)} × ${label}`,
      message: isNew ? 'New product registered with no price yet. Set it in Product master.' : `On hand is now ${int(current + qtyNum)}.`,
    });
    setTried(false);
    setSku('');
    setQty('');
    setNote('');
    setName('');
    setCategory('');
    setNewCategory('');
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
          <Button type="submit" variant="leaf" icon={PackagePlus} className="w-full">
            Add to stock
          </Button>
        </div>
      </form>
    </Panel>
  );
}

// ------------------------------------------------------------ Bulk receive
function BulkReceive() {
  const { data, dispatch } = useApp();
  const toast = useToast();
  const [date, setDate] = useState(isoDay());
  const [note, setNote] = useState('');
  const [qtys, setQtys] = useState({});
  const [fill, setFill] = useState('');
  const catIndex = useMemo(() => Object.fromEntries(data.categories.map((c, i) => [c.name, i])), [data.categories]);
  const rows = useMemo(
    () =>
      data.products
        .filter((p) => !p.isPackage && p.active !== false)
        .sort((a, b) => (catIndex[a.category] ?? 99) - (catIndex[b.category] ?? 99) || a.name.localeCompare(b.name)),
    [data.products, catIndex],
  );
  const entries = Object.entries(qtys)
    .map(([sku, v]) => ({ sku, qty: parseInt(v, 10) }))
    .filter((e) => e.qty > 0);
  const units = entries.reduce((a, e) => a + e.qty, 0);

  const submit = () => {
    if (!entries.length || !date) return;
    dispatch({ type: 'RECEIVE_STOCK', entries: entries.map((e) => ({ ...e, date, note: norm(note) })) });
    toast({ title: `Received ${int(units)} units`, message: `${int(entries.length)} products updated.` });
    setQtys({});
    setNote('');
  };

  return (
    <Panel
      title="Bulk receive"
      description="Enter quantities for many items at once. Useful for the first stock count or a large delivery."
      bodyClassName="pt-3"
    >
      <div className="grid gap-4 px-4 pb-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:px-5">
        <Field label="Date received" htmlFor="bk-date" required>
          <Input id="bk-date" type="date" value={date} max={isoDay()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="bk-note" hint="Optional. Applied to every line.">
          <Input id="bk-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Opening stock count" />
        </Field>
        <Field label="Fill blank rows with" htmlFor="bk-fill">
          <div className="flex gap-2">
            <Input id="bk-fill" inputMode="numeric" className="num w-24" value={fill} onChange={(e) => setFill(e.target.value.replace(/\D/g, ''))} placeholder="0" />
            <Button
              onClick={() => {
                if (!fill) return;
                setQtys((q) => {
                  const next = { ...q };
                  for (const r of rows) if (!next[r.sku]) next[r.sku] = fill;
                  return next;
                });
              }}
              disabled={!fill}
            >
              Fill
            </Button>
          </div>
        </Field>
      </div>
      <div className="max-h-[560px] overflow-auto border-t border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 z-[1] bg-sunken">
            <tr className="text-left text-xs font-semibold text-muted">
              <th scope="col" className="px-4 py-2.5 sm:px-5">Product</th>
              <th scope="col" className="px-3 py-2.5">SKU</th>
              <th scope="col" className="px-3 py-2.5 text-right">On hand</th>
              <th scope="col" className="px-3 py-2.5 text-right">Qty in</th>
              <th scope="col" className="px-4 py-2.5 text-right sm:px-5">After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const cur = onHand(data.stock[p.sku]);
              const add = parseInt(qtys[p.sku], 10) || 0;
              return (
                <tr key={p.sku} className={cx('border-t border-line', add > 0 && 'bg-leaf-soft/50')}>
                  <td className="px-4 py-1.5 sm:px-5">
                    <span className="flex items-center gap-2 font-semibold text-ink">
                      <CategoryDot category={p.category} />
                      {p.name}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <Sku>{p.sku}</Sku>
                  </td>
                  <td className="num px-3 py-1.5 text-right">{int(cur)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      aria-label={`Quantity in for ${p.name}`}
                      inputMode="numeric"
                      className="num h-9 w-24 rounded-lg border border-line-strong bg-surface px-2 text-right font-bold text-ink focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/30"
                      value={qtys[p.sku] || ''}
                      placeholder="0"
                      onChange={(e) => setQtys((q) => ({ ...q, [p.sku]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                    />
                  </td>
                  <td className={cx('num px-4 py-1.5 text-right sm:px-5', add > 0 ? 'font-extrabold text-ink' : 'text-muted')}>{int(cur + add)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-sm text-ink-2">
          {entries.length ? (
            <>
              <span className="font-bold text-ink">{int(entries.length)}</span> products, <span className="font-bold text-ink">{int(units)}</span> units
            </>
          ) : (
            'Enter at least one quantity.'
          )}
        </p>
        <div className="flex gap-2">
          {entries.length > 0 && (
            <Button variant="ghost" onClick={() => setQtys({})}>
              Clear
            </Button>
          )}
          <Button variant="leaf" icon={PackagePlus} onClick={submit} disabled={!entries.length || !date}>
            Receive {entries.length ? int(units) : ''} units
          </Button>
        </div>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------ Register
function RegisterProduct() {
  const { dispatch } = useApp();
  const toast = useToast();
  const [key, setKey] = useState(0);
  return (
    <Panel title="Register new product" description="Add a product or entry package to the catalog. You can set prices now or later in Product master.">
      <div className="max-w-3xl">
        <ProductForm
          key={key}
          allowOpeningStock
          submitLabel="Register product"
          onSubmit={(product, { openingStock }) => {
            dispatch({
              type: 'RECEIVE_STOCK',
              newProducts: [product],
              entries: openingStock > 0 ? [{ sku: product.sku, qty: openingStock, date: isoDay(), note: 'Opening stock' }] : [],
            });
            toast({ title: `${product.name} registered`, message: openingStock > 0 ? `Opening stock: ${int(openingStock)}.` : 'Add stock when it arrives.' });
            setKey((k) => k + 1);
          }}
        />
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------ History
function StockHistory() {
  const { data, dispatch } = useApp();
  const confirm = useConfirm();
  const toast = useToast();
  const [limit, setLimit] = useState(30);
  const bySku = useMemo(() => Object.fromEntries(data.products.map((p) => [p.sku, p])), [data.products]);
  const list = data.stockIns.slice(0, limit);

  const undo = async (e) => {
    const p = bySku[e.sku];
    const ok = await confirm({
      title: 'Undo this stock entry?',
      message: `This removes ${int(e.qty)} × ${p?.name || e.sku} from stock. The entry stays in the history, marked undone.`,
      confirmLabel: 'Undo entry',
      tone: 'danger',
    });
    if (!ok) return;
    dispatch({ type: 'REVERSE_STOCK_IN', id: e.id });
    toast({ title: 'Stock entry undone', message: `${p?.name || e.sku}: on hand is now ${int(onHand(data.stock[e.sku]) - e.qty)}.` });
  };

  return (
    <Panel title="Recent stock entries" className="mt-4" bodyClassName="pt-3">
      {list.length === 0 ? (
        <EmptyState icon={History} title="No stock entries yet" className="border-t border-line">
          Received stock appears here. Undo an entry if it was keyed in by mistake.
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-sunken text-left text-xs font-semibold text-muted">
                  <th scope="col" className="px-4 py-2.5 sm:px-5">Date received</th>
                  <th scope="col" className="px-3 py-2.5">Product</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Qty in</th>
                  <th scope="col" className="px-3 py-2.5">Note</th>
                  <th scope="col" className="px-3 py-2.5">Recorded</th>
                  <th scope="col" className="px-4 py-2.5 text-right sm:px-5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const p = bySku[e.sku];
                  const canUndo = !e.reversed && onHand(data.stock[e.sku]) - e.qty >= 0;
                  return (
                    <tr key={e.id} className={cx('border-t border-line', e.reversed && 'text-muted')}>
                      <td className="num whitespace-nowrap px-4 py-2 sm:px-5">{fmtDate(parseDay(e.date))}</td>
                      <td className="px-3 py-2">
                        <span className={cx('font-semibold', !e.reversed && 'text-ink', e.reversed && 'line-through')}>{p?.name || e.sku}</span>{' '}
                        <Sku>{e.sku}</Sku>
                      </td>
                      <td className={cx('num px-3 py-2 text-right font-bold', e.reversed ? 'line-through' : 'text-ok')}>+{int(e.qty)}</td>
                      <td className="max-w-[260px] truncate px-3 py-2" title={e.note}>
                        {e.note || '—'}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-muted">{fmtDateTimeShort(e.ts)}</td>
                      <td className="whitespace-nowrap px-4 py-1.5 text-right sm:px-5">
                        {e.reversed ? (
                          <Pill>Undone</Pill>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Undo2}
                            disabled={!canUndo}
                            title={canUndo ? 'Undo this entry' : 'Some of these units were already sold'}
                            onClick={() => undo(e)}
                          >
                            Undo
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.stockIns.length > limit && (
            <div className="border-t border-line px-4 py-3 text-center sm:px-5">
              <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 50)}>
                Show more ({int(data.stockIns.length - limit)} older)
              </Button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
