import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Boxes, Download, PackagePlus, Search } from 'lucide-react';
import { useApp } from '../lib/context';
import { onHand, stockStatus } from '../lib/pricing';
import { int, isoDay } from '../lib/format';
import { saveFile, toCSV } from '../lib/platform';
import { Button, CategoryDot, EmptyState, Field, Input, PageHeader, Select, Sku, StatusBadge, Toggle, cx, useToast } from '../components/ui';

const STATUS_ORDER = { out: 0, low: 1, in: 2 };
const FILTERS = [
  { value: 'all', label: 'All items' },
  { value: 'in', label: 'In stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
];

function Th({ k, sort, onSort, right, children }) {
  const on = sort.key === k;
  const Icon = on ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={cx('px-3 py-2.5', right && 'text-right')}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cx('inline-flex items-center gap-1 font-semibold hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf', right && 'flex-row-reverse', on && 'text-ink')}
      >
        {children}
        <Icon size={13} aria-hidden="true" className={on ? '' : 'opacity-50'} />
      </button>
    </th>
  );
}

export default function Inventory() {
  const { data, go } = useApp();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [status, setStatus] = useState('all');
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState({ key: 'default', dir: 1 });

  const catIndex = useMemo(() => Object.fromEntries(data.categories.map((c, i) => [c.name, i])), [data.categories]);
  const items = useMemo(
    () =>
      data.products
        .filter((p) => !p.isPackage && (archived || p.active !== false))
        .map((p) => {
          const row = data.stock[p.sku] || { added: 0, sold: 0 };
          const current = onHand(row);
          return { ...p, added: Number(row.added) || 0, sold: Number(row.sold) || 0, current, status: stockStatus(current, p.reorderLevel) };
        }),
    [data.products, data.stock, archived],
  );
  const counts = useMemo(() => {
    const c = { all: items.length, in: 0, low: 0, out: 0 };
    for (const it of items) c[it.status] += 1;
    return c;
  }, [items]);
  const cats = data.categories.filter((c) => !c.isPackage && items.some((it) => it.category === c.name));

  const rows = useMemo(() => {
    const qk = q.trim().toLowerCase();
    const list = items.filter(
      (it) =>
        (status === 'all' || it.status === status) &&
        (cat === 'All' || it.category === cat) &&
        (!qk || it.name.toLowerCase().includes(qk) || it.sku.toLowerCase().includes(qk)),
    );
    const cmp = {
      default: (a, b) => (catIndex[a.category] ?? 99) - (catIndex[b.category] ?? 99) || a.name.localeCompare(b.name),
      sku: (a, b) => a.sku.localeCompare(b.sku),
      name: (a, b) => a.name.localeCompare(b.name),
      added: (a, b) => a.added - b.added,
      sold: (a, b) => a.sold - b.sold,
      current: (a, b) => a.current - b.current,
      status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.current - b.current,
    }[sort.key];
    return list.sort((a, b) => cmp(a, b) * sort.dir);
  }, [items, q, cat, status, sort, catIndex]);

  const sortBy = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));
  const exportCsv = async () => {
    const header = ['SKU', 'Category', 'Product name', 'Qty added', 'Qty sold', 'Current stock', 'Reorder level', 'Status'];
    const label = { in: 'In stock', low: 'Low stock', out: 'Out of stock' };
    const lines = rows.map((r) => [r.sku, r.category, r.name, r.added, r.sold, r.current, r.reorderLevel, label[r.status]]);
    const res = await saveFile(`inventory-${isoDay()}.csv`, toCSV([header, ...lines]), 'text/csv');
    if (res.ok) toast({ title: 'Inventory exported', message: `${int(rows.length)} items in the file.` });
    else if (!res.declined) toast({ tone: 'bad', title: 'Export failed', message: res.message });
  };

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <PageHeader
        title="Inventory"
        description="Current stock = quantity added − quantity sold. Package sales deduct their contents here."
        actions={
          <>
            <Button icon={Download} onClick={exportCsv} disabled={!rows.length}>
              Export CSV
            </Button>
            <Button variant="leaf" icon={PackagePlus} onClick={() => go('stock')}>
              Add stock
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filter by stock status">
        {FILTERS.map((f) => {
          const on = status === f.value;
          const tone = { in: 'text-ok', low: 'text-warn', out: 'text-bad', all: 'text-ink' }[f.value];
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={on}
              onClick={() => setStatus(f.value)}
              className={cx(
                'rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf',
                on ? 'border-leaf bg-leaf-soft' : 'border-line bg-surface hover:bg-sunken',
              )}
            >
              <span className="block text-sm font-semibold text-ink-2">{f.label}</span>
              <span className={cx('num block text-2xl font-extrabold', tone)}>{int(counts[f.value])}</span>
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl border border-line bg-surface">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:px-5">
          <Field label="Search" htmlFor="inv-q">
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <Input id="inv-q" type="search" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name or SKU" />
            </div>
          </Field>
          <Field label="Category" htmlFor="inv-cat">
            <Select id="inv-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="All">All categories</option>
              {cats.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-3 pb-2.5">
            <Toggle id="inv-arch" checked={archived} onChange={setArchived} label="Include archived products" />
            <label htmlFor="inv-arch" className="text-sm font-semibold text-ink-2">
              Include archived
            </label>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Boxes} title="Nothing to show">
            {items.length ? 'No items match these filters.' : 'Add products in Product master to track them here.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="bg-sunken text-left text-xs text-muted">
                  <Th k="sku" sort={sort} onSort={sortBy}>SKU</Th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Category</th>
                  <Th k="name" sort={sort} onSort={sortBy}>Product name</Th>
                  <Th k="added" sort={sort} onSort={sortBy} right>Qty added</Th>
                  <Th k="sold" sort={sort} onSort={sortBy} right>Qty sold</Th>
                  <Th k="current" sort={sort} onSort={sortBy} right>Current stock</Th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Reorder level</th>
                  <Th k="status" sort={sort} onSort={sortBy}>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sku} className={cx('border-t border-line', r.active === false && 'text-muted')}>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Sku className="text-ink-2">{r.sku}</Sku>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <CategoryDot category={r.category} />
                        {r.category}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-ink">
                      {r.name}
                      {r.active === false && <span className="ml-2 text-xs font-normal text-muted">(archived)</span>}
                    </td>
                    <td className="num px-3 py-2.5 text-right">{int(r.added)}</td>
                    <td className="num px-3 py-2.5 text-right">{int(r.sold)}</td>
                    <td className={cx('num px-3 py-2.5 text-right text-base font-extrabold', { in: 'text-ink', low: 'text-warn', out: 'text-bad' }[r.status])}>
                      {int(r.current)}
                    </td>
                    <td className="num px-3 py-2.5 text-right text-muted">{int(r.reorderLevel)}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-3 text-sm text-muted">
        Low stock means at or below the reorder level. Change reorder levels in Product master. Entry packages aren’t listed because
        they are made of the items above.
      </p>
    </div>
  );
}
