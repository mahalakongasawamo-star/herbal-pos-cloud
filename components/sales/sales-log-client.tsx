'use client';

// Ported from legacy-vite-app/src/modules/SalesLog.jsx (SPEC §10 — layout and
// interaction port over, minimal change). What changed vs. legacy, and why:
//
//   - Server-paginated/filtered (lib/data/sales.ts's fetchSales), not an
//     in-memory array scan — sales is a real, growing cloud table now.
//   - No "cashier location" text filter: the cashier IS the signed-in user
//     (SPEC §9), so the filter is a Select of real staff (fetchStaff),
//     scoped by cashier_id. It's only shown to an owner or an all-branch
//     manager (profile.branch_id === null) — a single-branch cashier or
//     manager's results are already branch-scoped by RLS, so a picker would
//     be pointless for them.
//   - No branch filter: RLS already scopes what fetchSales() can return per
//     caller (SPEC §2), and legacy didn't have one either (single-branch app).
//   - Search matches what fetchSales' `.or(...)` actually searches — receipt
//     no., customer, leader, upline — not "cashier", since that's now an id
//     filter, not text.
//   - Summary line: legacy summed totalDue over the *entire* filtered set
//     client-side, which this can't do without an unbounded fetch. Rather
//     than show a misleading number, the completed/void counts and total
//     shown are for the *current page only* (labelled as such) — the
//     simplest option that can't lie. CSV export still covers every
//     filtered row, not just the page.
//   - CSV: legacy's 'Items'/'Units' columns needed each sale's line items,
//     which the list query deliberately doesn't fetch (perf, per the perf
//     note above). They're dropped; the remaining columns come straight off
//     each summary row, so export doesn't need a second per-sale fetch.
//   - Live updates: subscribes to the `sales` table directly and refetches
//     the current page/filters on any change, so a sale saved or voided at
//     another till (or another branch, for an owner) shows up without a
//     manual refresh — legacy had no such thing to port (single in-memory
//     array, single tab).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, ScrollText, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchSales, fetchSaleWithItems, type SalesFilter } from '@/lib/data/sales';
import { fetchStaff, type StaffMember } from '@/lib/data/staff';
import { usePrint } from '@/components/receipt/print-provider';
import { toCSV, saveFile } from '@/lib/platform';
import { fmtDateTime, int, isoDay, parseDay, peso } from '@/lib/format';
import { Button, EmptyState, Field, IconButton, Input, PageHeader, Pill, Select, Toggle, cx, useToast } from '@/components/ui';
import type { Profile } from '@/lib/auth';
import type { Sale } from '@/lib/types';

const PAGE_SIZE = 25;

type RangeValue = 'all' | 'today' | '7d' | 'month' | 'custom';

const RANGES: { value: RangeValue; label: string }[] = [
  { value: 'all', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];

function rangeBounds(range: RangeValue, from: string, to: string): { from?: string; to?: string } {
  if (range === 'today') {
    const d = isoDay();
    return { from: d, to: d };
  }
  if (range === '7d') {
    const now = new Date();
    return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), to: isoDay(now) };
  }
  if (range === 'month') {
    const now = new Date();
    return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
  }
  if (range === 'custom') {
    const a = parseDay(from);
    const b = parseDay(to);
    return a <= b ? { from, to } : { from: to, to: from };
  }
  return {};
}

export function SalesLogClient({ profile }: { profile: Profile }) {
  const supabase = useMemo(() => createClient(), []);
  const { viewReceipt } = usePrint();
  const toast = useToast();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cashierId, setCashierId] = useState('');
  const [range, setRange] = useState<RangeValue>('all');
  const [from, setFrom] = useState(isoDay());
  const [to, setTo] = useState(isoDay());
  const [showVoid, setShowVoid] = useState(true);
  const [page, setPage] = useState(0);

  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [exporting, setExporting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  // Single-branch cashiers/managers already see only their own branch's
  // sales via RLS; a cashier picker would just show one name, so it's
  // owner/all-branch-manager only (SPEC §2, §9).
  const showCashierFilter = !profile.branch_id;

  // Debounce the search box so it doesn't refetch on every keystroke. The
  // setState calls here happen inside the timer callback, not synchronously
  // in the effect body, so they don't trigger cascading renders — same as
  // resetting the page below happens in event handlers, not an effect.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const buildFilters = useCallback((): SalesFilter => {
    const bounds = rangeBounds(range, from, to);
    return {
      from: bounds.from,
      to: bounds.to,
      cashierId: cashierId || undefined,
      search: debouncedSearch || undefined,
      status: showVoid ? 'all' : 'completed',
    };
  }, [range, from, to, cashierId, debouncedSearch, showVoid]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetchSales(supabase, { ...buildFilters(), page, pageSize: PAGE_SIZE });
        if (cancelled) return;
        setSales(res.sales);
        setTotal(res.total);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    // run()'s setState calls happen after an await, not synchronously during
    // this effect — same mount-time-fetch pattern as CatalogProvider's
    // refetch() and StockHistory's load(). `loading` starts true (below) for
    // the first paint; later fetches leave the previous page on screen until
    // the new one arrives instead of flashing back to a loading state.
    void run();
    return () => {
      cancelled = true;
    };
  }, [supabase, buildFilters, page, refreshTick]);

  // Live updates: a sale saved or voided anywhere in scope refreshes this page.
  useEffect(() => {
    const channel = supabase
      .channel('sales-log-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => setRefreshTick((t) => t + 1))
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    if (!showCashierFilter) return;
    let cancelled = false;
    void fetchStaff(supabase).then((rows) => {
      if (!cancelled) setStaff(rows.filter((s) => s.active));
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, showCashierFilter]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const completedOnPage = sales.filter((s) => s.status !== 'void');
  const voidOnPage = sales.length - completedOnPage.length;
  const pageTotal = completedOnPage.reduce((a, s) => a + (Number(s.totalDue) || 0), 0);

  const isDefaultFilters = !debouncedSearch && !cashierId && range === 'all' && showVoid;
  const noSalesAtAll = total === 0 && isDefaultFilters;

  const openReceipt = async (sale: Sale) => {
    setViewingId(sale.id);
    try {
      const full = await fetchSaleWithItems(supabase, sale.id);
      if (full) viewReceipt(full);
      else toast({ tone: 'bad', title: 'Receipt not found', message: 'This sale may have been removed.' });
    } catch (err) {
      toast({ tone: 'bad', title: 'Could not open receipt', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setViewingId(null);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const filters = buildFilters();
      const batchSize = 500;
      let all: Sale[] = [];
      let p = 0;
      for (;;) {
        const res = await fetchSales(supabase, { ...filters, page: p, pageSize: batchSize });
        all = all.concat(res.sales);
        if (res.sales.length === 0 || all.length >= res.total) break;
        p += 1;
      }
      const header = [
        'Receipt No',
        'Date',
        'Time',
        'Status',
        'Customer',
        'Customer tier',
        'Member tier',
        'Leader',
        'Upline',
        'Cashier',
        'Payment method',
        'Reference',
        'Total due',
        'Void reason',
      ];
      const lines = all.map((s) => {
        const d = new Date(s.createdAt);
        return [
          s.receiptNo,
          isoDay(d),
          d.toLocaleTimeString('en-PH', { hour12: false }),
          s.status === 'void' ? 'Void' : 'Completed',
          s.customerName,
          s.customerTier,
          s.memberTier ?? '',
          s.leaderName,
          s.uplineName,
          s.cashierName ?? '',
          s.paymentMethodName,
          s.reference,
          s.totalDue,
          s.voidReason ?? '',
        ];
      });
      const r = await saveFile(`sales-log-${isoDay()}.csv`, toCSV([header, ...lines]), 'text/csv');
      if (r.ok) toast({ title: 'Sales log exported', message: `${int(all.length)} transactions in the file.` });
      else if (!r.declined) toast({ tone: 'bad', title: 'Export failed', message: r.message ?? 'Could not save the file. Try again.' });
    } catch (err) {
      toast({ tone: 'bad', title: 'Export failed', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <PageHeader
        title="Sales log"
        description="Every saved transaction, newest first. Open one to reprint or void it."
        actions={
          <Button icon={Download} onClick={() => void exportCsv()} disabled={exporting || loading || !!error || total === 0}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        }
      />

      <section className="rounded-2xl border border-line bg-surface">
        <div
          className={cx(
            'grid gap-3 border-b border-line p-4 sm:grid-cols-2 sm:px-5',
            showCashierFilter ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]' : 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]',
          )}
        >
          <Field label="Search" htmlFor="sl-q">
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <Input
                id="sl-q"
                type="search"
                className="pl-10"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Customer, leader, upline or receipt no."
              />
            </div>
          </Field>
          {showCashierFilter && (
            <Field label="Cashier" htmlFor="sl-cashier">
              <Select
                id="sl-cashier"
                value={cashierId}
                onChange={(e) => {
                  setCashierId(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">All cashiers</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                    {s.branchCode ? ` (${s.branchCode})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Date" htmlFor="sl-range">
            <Select
              id="sl-range"
              value={range}
              onChange={(e) => {
                setRange(e.target.value as RangeValue);
                setPage(0);
              }}
            >
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-3 pb-2.5">
            <Toggle
              id="sl-void"
              checked={showVoid}
              onChange={(v) => {
                setShowVoid(v);
                setPage(0);
              }}
              label="Show voided sales"
            />
            <label htmlFor="sl-void" className="text-sm font-semibold text-ink-2">
              Show voided
            </label>
          </div>
          {range === 'custom' && (
            <div className={cx('grid grid-cols-2 gap-3 sm:col-span-2 lg:max-w-md', showCashierFilter ? 'lg:col-span-4' : 'lg:col-span-3')}>
              <Field label="From" htmlFor="sl-from">
                <Input
                  id="sl-from"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(0);
                  }}
                />
              </Field>
              <Field label="To" htmlFor="sl-to">
                <Input
                  id="sl-to"
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(0);
                  }}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
          <p className="text-ink-2">
            <span className="font-bold text-ink">{int(completedOnPage.length)}</span> completed
            {voidOnPage > 0 && (
              <>
                , {int(voidOnPage)} void
              </>
            )}
            <span className="text-muted"> (this page)</span>
          </p>
          <p className="text-ink-2">
            This page’s total <span className="num text-base font-extrabold text-ink">{peso(pageTotal)}</span>
          </p>
        </div>

        {error ? (
          <div className="border-t border-line px-4 py-6 text-sm font-semibold text-bad sm:px-5">Could not load sales: {error}</div>
        ) : sales.length === 0 ? (
          <EmptyState icon={ScrollText} title={loading ? 'Loading…' : noSalesAtAll ? 'No sales yet' : 'No transactions match these filters'} className="border-t border-line">
            {loading ? null : noSalesAtAll ? 'Saved sales from the POS appear here.' : 'Clear the search or widen the date range.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="bg-sunken text-left text-xs font-semibold text-muted">
                  <th scope="col" className="px-4 py-2.5 sm:px-5">
                    Receipt no.
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Timestamp
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Customer
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Leader
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Cashier
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Payment method
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right">
                    Total amount
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right sm:px-5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const isVoid = s.status === 'void';
                  return (
                    <tr key={s.id} className={cx('border-t border-line align-top', isVoid ? 'text-muted' : 'hover:bg-sunken/60')}>
                      <td className="whitespace-nowrap px-4 py-2.5 sm:px-5">
                        <span className="font-mono text-[13px] font-semibold text-ink">{s.receiptNo}</span>
                        {isVoid && (
                          <Pill tone="bad" className="ml-2">
                            Void
                          </Pill>
                        )}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2.5">{fmtDateTime(s.createdAt)}</td>
                      <td className="px-3 py-2.5">
                        <span className={cx('font-semibold', isVoid ? '' : 'text-ink')}>{s.customerName}</span>
                        {s.customerTier === 'Member' && <span className="block text-xs text-muted">Member{s.memberTier ? `, ${s.memberTier}` : ''}</span>}
                      </td>
                      <td className="px-3 py-2.5">{s.leaderName || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{s.cashierName || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{s.paymentMethodName}</td>
                      <td className={cx('num whitespace-nowrap px-3 py-2.5 text-right font-bold', isVoid ? 'line-through' : 'text-ink')}>{peso(s.totalDue)}</td>
                      <td className="px-4 py-1.5 text-right sm:px-5">
                        <Button size="sm" variant="ghost" icon={Eye} onClick={() => void openReceipt(s)} disabled={viewingId === s.id}>
                          {viewingId === s.id ? 'Opening…' : 'View receipt'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm sm:px-5">
            <p className="text-muted">
              Showing {int(page * PAGE_SIZE + 1)}–{int(Math.min((page + 1) * PAGE_SIZE, total))} of {int(total)}
            </p>
            <div className="flex items-center gap-1">
              <IconButton icon={ChevronLeft} label="Previous page" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0} />
              <span className="num px-2 font-semibold">
                {page + 1} / {pages}
              </span>
              <IconButton icon={ChevronRight} label="Next page" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
