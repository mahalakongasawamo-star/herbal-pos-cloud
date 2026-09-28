import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, ScrollText, Search } from 'lucide-react';
import { useApp } from '../lib/context';
import { fmtDateTime, int, isoDay, parseDay, peso } from '../lib/format';
import { saveFile, toCSV } from '../lib/platform';
import { Button, EmptyState, Field, IconButton, Input, PageHeader, Pill, Select, Toggle, cx, useToast } from '../components/ui';

const RANGES = [
  { value: 'all', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];
const PAGE = 25;

function rangeBounds(range, from, to) {
  const now = new Date();
  const day = (y, m, d) => new Date(y, m, d);
  if (range === 'today') return [day(now.getFullYear(), now.getMonth(), now.getDate()), day(now.getFullYear(), now.getMonth(), now.getDate() + 1)];
  if (range === '7d') return [day(now.getFullYear(), now.getMonth(), now.getDate() - 6), day(now.getFullYear(), now.getMonth(), now.getDate() + 1)];
  if (range === 'month') return [day(now.getFullYear(), now.getMonth(), 1), day(now.getFullYear(), now.getMonth() + 1, 1)];
  if (range === 'custom') {
    const a = parseDay(from);
    const b = parseDay(to);
    const [s, e] = a <= b ? [a, b] : [b, a];
    return [s, day(e.getFullYear(), e.getMonth(), e.getDate() + 1)];
  }
  return [null, null];
}

export default function SalesLog() {
  const { data, viewReceipt } = useApp();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cashier, setCashier] = useState('All');
  const [range, setRange] = useState('all');
  const [from, setFrom] = useState(isoDay());
  const [to, setTo] = useState(isoDay());
  const [showVoid, setShowVoid] = useState(true);
  const [page, setPage] = useState(1);

  const cashiers = useMemo(() => {
    const set = new Set(data.options.cashiers);
    for (const s of data.sales) if (s.cashier) set.add(s.cashier);
    return [...set];
  }, [data.options.cashiers, data.sales]);

  const rows = useMemo(() => {
    const qk = q.trim().toLowerCase();
    const [start, end] = rangeBounds(range, from, to);
    return data.sales
      .filter((s) => {
        if (!showVoid && s.status === 'void') return false;
        if (cashier !== 'All' && s.cashier !== cashier) return false;
        if (start) {
          const t = new Date(s.ts);
          if (t < start || t >= end) return false;
        }
        if (qk && ![s.customerName, s.leaderName, s.receiptNo, s.cashier].some((v) => String(v || '').toLowerCase().includes(qk))) return false;
        return true;
      })
      .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  }, [data.sales, q, cashier, range, from, to, showVoid]);

  useEffect(() => setPage(1), [q, cashier, range, from, to, showVoid]);

  const completed = rows.filter((s) => s.status !== 'void');
  const total = completed.reduce((a, s) => a + (Number(s.totalDue) || 0), 0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages);
  const pageRows = rows.slice((cur - 1) * PAGE, cur * PAGE);

  const exportCsv = async () => {
    const header = [
      'Receipt No', 'Date', 'Time', 'Status', 'Customer', 'Customer tier', 'Member tier', 'Leader', 'Upline', 'Cashier',
      'Payment method', 'Reference', 'Items', 'Units', 'Gross total', 'Member discount', 'Total due', 'Tendered', 'Change', 'Void reason',
    ];
    const lines = rows.map((s) => {
      const d = new Date(s.ts);
      return [
        s.receiptNo, isoDay(d), d.toLocaleTimeString('en-PH', { hour12: false }), s.status === 'void' ? 'Void' : 'Completed',
        s.customerName, s.customerTier, s.memberTier, s.leaderName, s.uplineName, s.cashier, s.paymentMethod, s.reference,
        s.items.map((i) => `${i.qty} x ${i.name}`).join('; '), s.items.reduce((a, i) => a + i.qty, 0),
        s.grossTotal, s.discountTotal, s.totalDue, s.tendered, s.change, s.voidReason || '',
      ];
    });
    const r = await saveFile(`sales-log-${isoDay()}.csv`, toCSV([header, ...lines]), 'text/csv');
    if (r.ok) toast({ title: 'Sales log exported', message: `${int(rows.length)} transactions in the file.` });
    else if (!r.declined) toast({ tone: 'bad', title: 'Export failed', message: r.message });
  };

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <PageHeader
        title="Sales log"
        description="Every saved transaction, newest first. Open one to reprint or void it."
        actions={
          <Button icon={Download} onClick={exportCsv} disabled={!rows.length}>
            Export CSV
          </Button>
        }
      />

      <section className="rounded-2xl border border-line bg-surface">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Search" htmlFor="sl-q">
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <Input id="sl-q" type="search" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer, leader, receipt no. or cashier" />
            </div>
          </Field>
          <Field label="Cashier location" htmlFor="sl-cashier">
            <Select id="sl-cashier" value={cashier} onChange={(e) => setCashier(e.target.value)}>
              <option value="All">All locations</option>
              {cashiers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="sl-range">
            <Select id="sl-range" value={range} onChange={(e) => setRange(e.target.value)}>
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-3 pb-2.5">
            <Toggle id="sl-void" checked={showVoid} onChange={setShowVoid} label="Show voided sales" />
            <label htmlFor="sl-void" className="text-sm font-semibold text-ink-2">
              Show voided
            </label>
          </div>
          {range === 'custom' && (
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-4 lg:max-w-md">
              <Field label="From" htmlFor="sl-from">
                <Input id="sl-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To" htmlFor="sl-to">
                <Input id="sl-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
          <p className="text-ink-2">
            <span className="font-bold text-ink">{int(completed.length)}</span> completed
            {rows.length !== completed.length && <>, {int(rows.length - completed.length)} void</>}
          </p>
          <p className="text-ink-2">
            Total <span className="num text-base font-extrabold text-ink">{peso(total)}</span>
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={ScrollText} title={data.sales.length ? 'No transactions match these filters' : 'No sales yet'} className="border-t border-line">
            {data.sales.length ? 'Clear the search or widen the date range.' : 'Saved sales from the POS appear here.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="bg-sunken text-left text-xs font-semibold text-muted">
                  <th scope="col" className="px-4 py-2.5 sm:px-5">Receipt no.</th>
                  <th scope="col" className="px-3 py-2.5">Timestamp</th>
                  <th scope="col" className="px-3 py-2.5">Customer</th>
                  <th scope="col" className="px-3 py-2.5">Leader</th>
                  <th scope="col" className="px-3 py-2.5">Cashier</th>
                  <th scope="col" className="px-3 py-2.5">Payment method</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Total amount</th>
                  <th scope="col" className="px-4 py-2.5 text-right sm:px-5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => {
                  const isVoid = s.status === 'void';
                  return (
                    <tr key={s.receiptNo} className={cx('border-t border-line', isVoid ? 'text-muted' : 'hover:bg-sunken/60')}>
                      <td className="whitespace-nowrap px-4 py-2.5 sm:px-5">
                        <span className="font-mono text-[13px] font-semibold text-ink">{s.receiptNo}</span>
                        {isVoid && (
                          <Pill tone="bad" className="ml-2">
                            Void
                          </Pill>
                        )}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2.5">{fmtDateTime(s.ts)}</td>
                      <td className="px-3 py-2.5">
                        <span className={cx('font-semibold', isVoid ? '' : 'text-ink')}>{s.customerName}</span>
                        {s.customerTier === 'Member' && <span className="block text-xs text-muted">Member{s.memberTier ? `, ${s.memberTier}` : ''}</span>}
                      </td>
                      <td className="px-3 py-2.5">{s.leaderName || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{s.cashier}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{s.paymentMethod}</td>
                      <td className={cx('num whitespace-nowrap px-3 py-2.5 text-right font-bold', isVoid ? 'line-through' : 'text-ink')}>{peso(s.totalDue)}</td>
                      <td className="px-4 py-1.5 text-right sm:px-5">
                        <Button size="sm" variant="ghost" icon={Eye} onClick={() => viewReceipt(s.receiptNo)}>
                          View receipt
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
              Showing {int((cur - 1) * PAGE + 1)}–{int(Math.min(cur * PAGE, rows.length))} of {int(rows.length)}
            </p>
            <div className="flex items-center gap-1">
              <IconButton icon={ChevronLeft} label="Previous page" onClick={() => setPage(cur - 1)} disabled={cur <= 1} />
              <span className="num px-2 font-semibold">
                {cur} / {pages}
              </span>
              <IconButton icon={ChevronRight} label="Next page" onClick={() => setPage(cur + 1)} disabled={cur >= pages} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
