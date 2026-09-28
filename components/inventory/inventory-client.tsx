'use client';

// Ported from legacy-vite-app/src/modules/Inventory.jsx (SPEC §10 — layout and
// interaction port over, minimal change). What changed vs. legacy, deliberately:
//
//   - Multi-branch: this app has no pooled stock number (CLAUDE.md golden rule
//     #6), so a single-branch cashier/manager just sees their own branch (no
//     picker), while an owner/all-branch manager gets a Branch selector that
//     defaults to "All branches" — a combined view with one stock column per
//     branch plus a Total column — so they're never silently shown just one
//     branch's numbers with no indication. Picking one branch collapses back
//     to the legacy single "Current stock" column.
//   - Legacy's stock model was a running added/sold pair kept in memory; this
//     app's `stock_balances` table only tracks a net `qty` per branch (kept
//     live by the four RPCs writing an append-only `stock_ledger`). There is
//     no separate "added"/"sold" number to show, so those two legacy columns
//     (and their sort keys) are dropped; "Current stock" is the on-hand qty
//     from useLiveStock(), which is realtime-synced already.
//   - Packages are still always excluded (they're made of the rows shown).
import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, Boxes, Download, MapPin, PackagePlus, Search } from 'lucide-react';
import { useCatalog } from '@/components/providers/catalog-provider';
import { useLiveStock } from '@/lib/hooks/use-live-stock';
import { stockStatus } from '@/lib/pricing';
import { int, isoDay } from '@/lib/format';
import { saveFile, toCSV } from '@/lib/platform';
import { Button, CategoryDot, EmptyState, Field, Input, PageHeader, Pill, Select, Sku, StatusBadge, Toggle, cx, useToast, type StockStatus } from '@/components/ui';
import { canAccess } from '@/lib/nav';
import type { Profile } from '@/lib/auth';
import type { Product } from '@/lib/types';

const STATUS_ORDER: Record<StockStatus, number> = { out: 0, low: 1, in: 2 };
const FILTERS: { value: 'all' | StockStatus; label: string }[] = [
  { value: 'all', label: 'All items' },
  { value: 'in', label: 'In stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
];
const ALL_BRANCHES = '__all__';

interface Row extends Product {
  current: number;
  status: StockStatus;
  perBranch: Record<string, number>;
}

type SortKey = 'default' | 'sku' | 'name' | 'current' | 'status';
interface Sort {
  key: SortKey;
  dir: 1 | -1;
}

function Th({ k, sort, onSort, right, children }: { k: SortKey; sort: Sort; onSort: (k: SortKey) => void; right?: boolean; children: ReactNode }) {
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

export function InventoryClient({ profile }: { profile: Profile }) {
  const { categories, products, branches } = useCatalog();
  const stock = useLiveStock();
  const toast = useToast();
  const router = useRouter();

  const fixedBranchId = profile.branch_id; // non-null: single-branch cashier/manager, no picker.
  const [branchSel, setBranchSel] = useState<string>(fixedBranchId ?? ALL_BRANCHES);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [status, setStatus] = useState<'all' | StockStatus>('all');
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: 'default', dir: 1 });

  const showAll = !fixedBranchId && branchSel === ALL_BRANCHES;
  const activeBranchId = fixedBranchId ?? (branchSel === ALL_BRANCHES ? null : branchSel);

  const catIndex = useMemo(() => Object.fromEntries(categories.map((c) => [c.name, c.sortOrder])), [categories]);

  const items = useMemo<Row[]>(
    () =>
      products
        .filter((p) => !p.isPackage && (archived || p.active !== false))
        .map((p) => {
          const perBranch = Object.fromEntries(branches.map((b) => [b.id, stock.onHand(b.id, p.id)]));
          const current = showAll ? branches.reduce((sum, b) => sum + perBranch[b.id], 0) : stock.onHand(activeBranchId ?? '', p.id);
          return { ...p, current, perBranch, status: stockStatus(current, p.reorderLevel) as StockStatus };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stock.onHand's identity changes every render (see use-live-stock.ts); stock.balances is the real dependency.
    [products, branches, archived, showAll, activeBranchId, stock.balances],
  );

  const counts = useMemo(() => {
    const c: Record<'all' | StockStatus, number> = { all: items.length, in: 0, low: 0, out: 0 };
    for (const it of items) c[it.status] += 1;
    return c;
  }, [items]);

  const cats = categories.filter((c) => !c.isPackage && items.some((it) => it.category === c.name));

  const rows = useMemo(() => {
    const qk = q.trim().toLowerCase();
    const list = items.filter(
      (it) =>
        (status === 'all' || it.status === status) &&
        (cat === 'All' || it.category === cat) &&
        (!qk || it.name.toLowerCase().includes(qk) || it.sku.toLowerCase().includes(qk)),
    );
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      default: (a, b) => (catIndex[a.category] ?? 99) - (catIndex[b.category] ?? 99) || a.name.localeCompare(b.name),
      sku: (a, b) => a.sku.localeCompare(b.sku),
      name: (a, b) => a.name.localeCompare(b.name),
      current: (a, b) => a.current - b.current,
      status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.current - b.current,
    };
    return [...list].sort((a, b) => cmp[sort.key](a, b) * sort.dir);
  }, [items, q, cat, status, sort, catIndex]);

  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const exportCsv = async () => {
    const branchCode = showAll ? 'ALL' : (branches.find((b) => b.id === activeBranchId)?.code ?? 'BRANCH');
    const label: Record<StockStatus, string> = { in: 'In stock', low: 'Low stock', out: 'Out of stock' };
    const header = showAll
      ? ['SKU', 'Category', 'Product name', ...branches.map((b) => `${b.code} stock`), 'Total stock', 'Reorder level', 'Status']
      : ['SKU', 'Category', 'Product name', 'Current stock', 'Reorder level', 'Status'];
    const lines = rows.map((r) =>
      showAll
        ? [r.sku, r.category, r.name, ...branches.map((b) => r.perBranch[b.id] ?? 0), r.current, r.reorderLevel, label[r.status]]
        : [r.sku, r.category, r.name, r.current, r.reorderLevel, label[r.status]],
    );
    const res = await saveFile(`inventory-${branchCode}-${isoDay()}.csv`, toCSV([header, ...lines]), 'text/csv');
    if (res.ok) toast({ title: 'Inventory exported', message: `${int(rows.length)} items in the file.` });
    else if (!res.declined) toast({ tone: 'bad', title: 'Export failed', message: res.message });
  };

  const branchLabel = fixedBranchId ? (profile.branch?.code ?? 'Assigned branch') : showAll ? 'All branches' : (branches.find((b) => b.id === branchSel)?.code ?? '');

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <PageHeader
        title="Inventory"
        description="Live stock per branch, updating as either branch sells or receives stock. Entry packages aren't stock items — see the note below."
        actions={
          <>
            <Button icon={Download} onClick={exportCsv} disabled={!rows.length}>
              Export CSV
            </Button>
            {canAccess(profile.role, 'stock') && (
              <Button variant="leaf" icon={PackagePlus} onClick={() => router.push('/stock')}>
                Add stock
              </Button>
            )}
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
        <div
          className={cx(
            'grid gap-3 border-b border-line p-4 sm:px-5',
            fixedBranchId ? 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]' : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_auto]',
          )}
        >
          {!fixedBranchId && (
            <Field label="Branch" htmlFor="inv-branch">
              <Select id="inv-branch" value={branchSel} onChange={(e) => setBranchSel(e.target.value)}>
                <option value={ALL_BRANCHES}>All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
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

        {fixedBranchId && (
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5 text-sm font-semibold text-ink-2 sm:px-5">
            <MapPin size={15} className="text-leaf" aria-hidden="true" />
            Showing {branchLabel} only
          </div>
        )}
        {!fixedBranchId && showAll && (
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-semibold text-ink-2 sm:px-5">
            <Pill tone="leaf">All branches</Pill>
            One column per branch, plus a combined total. Stock status and counts use the total.
          </div>
        )}

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
                  {showAll ? (
                    <>
                      {branches.map((b) => (
                        <th key={b.id} scope="col" className="px-3 py-2.5 text-right font-semibold">
                          {b.code}
                        </th>
                      ))}
                      <Th k="current" sort={sort} onSort={sortBy} right>Total</Th>
                    </>
                  ) : (
                    <Th k="current" sort={sort} onSort={sortBy} right>Current stock</Th>
                  )}
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Reorder level</th>
                  <Th k="status" sort={sort} onSort={sortBy}>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={cx('border-t border-line', r.active === false && 'text-muted')}>
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
                    {showAll ? (
                      <>
                        {branches.map((b) => (
                          <td key={b.id} className="num px-3 py-2.5 text-right text-ink-2">
                            {int(r.perBranch[b.id] ?? 0)}
                          </td>
                        ))}
                        <td className={cx('num px-3 py-2.5 text-right text-base font-extrabold', { in: 'text-ink', low: 'text-warn', out: 'text-bad' }[r.status])}>
                          {int(r.current)}
                        </td>
                      </>
                    ) : (
                      <td className={cx('num px-3 py-2.5 text-right text-base font-extrabold', { in: 'text-ink', low: 'text-warn', out: 'text-bad' }[r.status])}>
                        {int(r.current)}
                      </td>
                    )}
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
        Low stock means at or below the reorder level. Change reorder levels in Product master. Entry packages aren&rsquo;t listed
        because they are made of the items above.
      </p>
    </div>
  );
}
