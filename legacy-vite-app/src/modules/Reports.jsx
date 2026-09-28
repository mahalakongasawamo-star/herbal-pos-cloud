import React, { useMemo, useState } from 'react';
import { ChartColumn, ChevronLeft, ChevronRight, Crown } from 'lucide-react';
import { useApp } from '../lib/context';
import { PERIODS, bucketsFor, rangeFor, rangeLabel, shiftAnchor } from '../lib/periods';
import { int, keyOf, norm, peso } from '../lib/format';
import { Button, EmptyState, IconButton, Meter, PageHeader, Panel, Segmented, Select, Sku, cx } from '../components/ui';

function bump(map, key, label, amount, qty = 0) {
  const cur = map.get(key) || { label, amount: 0, qty: 0, count: 0 };
  cur.label = label; // keep the most recent spelling
  cur.amount += amount;
  cur.qty += qty;
  cur.count += 1;
  map.set(key, cur);
}
const top = (map, by, n = 5) => [...map.values()].sort((a, b) => b[by] - a[by] || b.amount - a.amount).slice(0, n);

export default function Reports() {
  const { data } = useApp();
  const [period, setPeriod] = useState('Daily');
  const [anchor, setAnchor] = useState(() => new Date());
  const [cashier, setCashier] = useState('All');
  const range = useMemo(() => rangeFor(period, anchor), [period, anchor]);
  const isCurrent = useMemo(() => {
    const now = new Date();
    return now >= range.start && now < range.end;
  }, [range]);

  const cashiers = useMemo(() => {
    const set = new Set(data.options.cashiers);
    for (const s of data.sales) if (s.cashier) set.add(s.cashier);
    return [...set];
  }, [data.options.cashiers, data.sales]);

  const r = useMemo(() => {
    const b = bucketsFor(period, range);
    const trend = Array.from({ length: b.count }, () => ({ amount: 0, count: 0 }));
    const pay = new Map();
    const desk = new Map();
    const products = new Map();
    const packages = new Map();
    const leaders = new Map();
    const uplines = new Map();
    const released = new Map();
    let net = 0;
    let discount = 0;
    let count = 0;
    let units = 0;
    const bySku = Object.fromEntries(data.products.map((p) => [p.sku, p]));
    for (const s of data.sales) {
      if (s.status === 'void') continue;
      if (cashier !== 'All' && s.cashier !== cashier) continue;
      const t = new Date(s.ts);
      if (t < range.start || t >= range.end) continue;
      const total = Number(s.totalDue) || 0;
      net += total;
      discount += Number(s.discountTotal) || 0;
      count += 1;
      const i = b.indexOf(t);
      if (trend[i]) {
        trend[i].amount += total;
        trend[i].count += 1;
      }
      bump(pay, s.paymentMethod, s.paymentMethod, total);
      bump(desk, s.cashier, s.cashier, total);
      if (norm(s.leaderName)) bump(leaders, keyOf(s.leaderName), norm(s.leaderName), total);
      if (norm(s.uplineName)) bump(uplines, keyOf(s.uplineName), norm(s.uplineName), total);
      for (const it of s.items) {
        units += it.qty;
        bump(it.isPackage ? packages : products, it.sku, it.name, Number(it.net) || 0, it.qty);
        if (it.isPackage) {
          for (const inc of it.inclusions || []) {
            const k = inc.sku;
            const cur = released.get(k) || { label: inc.name || bySku[k]?.name || k, qty: 0 };
            cur.qty += inc.qty * it.qty;
            released.set(k, cur);
          }
        }
      }
    }
    for (const m of [products, packages]) for (const [sku, v] of m) v.sku = sku;
    return {
      b,
      trend,
      net,
      discount,
      count,
      units,
      avg: count ? net / count : 0,
      pay: [...pay.values()].sort((a, c) => c.amount - a.amount),
      desk: [...desk.values()].sort((a, c) => c.amount - a.amount),
      topProducts: top(products, 'qty'),
      topPackages: top(packages, 'qty'),
      topLeaders: top(leaders, 'amount'),
      topUplines: top(uplines, 'amount'),
      released: [...released.values()].sort((a, c) => c.qty - a.qty),
    };
  }, [data.sales, data.products, cashier, period, range]);

  const maxTrend = Math.max(0, ...r.trend.map((x) => x.amount));

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <PageHeader title="Reports" description="Completed sales only. Voided receipts are left out." />

      <section className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface p-4 sm:px-5">
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink-2">Period</p>
          <Segmented
            ariaLabel="Report period"
            size="sm"
            value={period}
            onChange={(p) => {
              setPeriod(p);
            }}
            options={PERIODS.map((p) => ({ value: p, label: p }))}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-sm font-semibold text-ink-2">Showing</p>
          <div className="flex flex-wrap items-center gap-2">
            <IconButton icon={ChevronLeft} label="Previous period" onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))} />
            <span className="num min-w-[10ch] text-[17px] font-bold text-ink" aria-live="polite">
              {rangeLabel(period, range)}
            </span>
            <IconButton icon={ChevronRight} label="Next period" onClick={() => setAnchor((a) => shiftAnchor(period, a, 1))} disabled={isCurrent} />
            {!isCurrent && (
              <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>
                Back to current
              </Button>
            )}
          </div>
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor="rp-cashier" className="mb-1.5 block text-sm font-semibold text-ink-2">
            Cashier location
          </label>
          <Select id="rp-cashier" value={cashier} onChange={(e) => setCashier(e.target.value)} className="h-9">
            <option value="All">All locations</option>
            {cashiers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </section>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi label="Net sales" value={peso(r.net)} strong />
        <Kpi label="Transactions" value={int(r.count)} />
        <Kpi label="Average sale" value={peso(r.avg)} />
        <Kpi label="Member discounts given" value={peso(r.discount)} />
      </div>

      {r.count === 0 ? (
        <section className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={ChartColumn} title="No completed sales in this period">
            {data.sales.length ? 'Use the arrows to look at another period, or change the cashier filter.' : 'Reports fill in as sales are saved in the POS.'}
          </EmptyState>
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="Sales trend" description={`Net sales by ${{ Daily: 'hour', Weekly: 'day', Monthly: 'day', Yearly: 'month' }[period]}`} className="xl:col-span-2">
            <TrendChart trend={r.trend} b={r.b} max={maxTrend} />
          </Panel>
          <div className="grid gap-4">
            <Panel title="Payment methods">
              <Split rows={r.pay} total={r.net} />
            </Panel>
            <Panel title="By cashier location">
              <Split rows={r.desk} total={r.net} tone="turmeric" />
            </Panel>
          </div>

          <Panel title="Top 5 products" description="By quantity sold, not counting package contents">
            <Ranked rows={r.topProducts} value={(x) => `${int(x.qty)} sold`} sub={(x) => peso(x.amount)} sku />
          </Panel>
          <Panel title="Top entry packages" description="By packages sold">
            <Ranked rows={r.topPackages} value={(x) => `${int(x.qty)} sold`} sub={(x) => peso(x.amount)} empty="No packages sold in this period." />
            {r.released.length > 0 && (
              <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
                Contents released: {r.released.map((x) => `${int(x.qty)} × ${x.label}`).join(', ')}
              </p>
            )}
          </Panel>
          <div className="grid gap-4">
            <Panel title="Top leaders" description="By revenue on their customers’ sales">
              <Ranked rows={r.topLeaders} value={(x) => peso(x.amount)} sub={(x) => `${int(x.count)} sales`} crown empty="No leader names recorded." />
            </Panel>
            <Panel title="Top uplines" description="By revenue">
              <Ranked rows={r.topUplines} value={(x) => peso(x.amount)} sub={(x) => `${int(x.count)} sales`} crown empty="No upline names recorded." />
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, strong }) {
  return (
    <div className={cx('rounded-2xl border px-4 py-3', strong ? 'border-leaf bg-leaf text-leaf-ink' : 'border-line bg-surface')}>
      <p className={cx('text-sm font-semibold', strong ? 'text-leaf-ink/80' : 'text-muted')}>{label}</p>
      <p className={cx('num mt-0.5 text-2xl font-extrabold tracking-tight', strong ? '' : 'text-ink')}>{value}</p>
    </div>
  );
}

function TrendChart({ trend, b, max }) {
  const H = 190;
  return (
    <div>
      <div className="flex items-end gap-[3px] border-b border-line-strong" style={{ height: H }} role="img" aria-label="Net sales trend">
        {trend.map((x, i) => {
          const h = max > 0 ? Math.round((x.amount / max) * (H - 18)) : 0;
          return (
            <div key={i} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${b.title(i)}: ${peso(x.amount)} (${int(x.count)} sales)`}>
              <div className={cx('w-full rounded-t-[4px] transition-colors', x.amount > 0 ? 'bg-leaf group-hover:bg-turmeric' : 'bg-line')} style={{ height: Math.max(x.amount > 0 ? 3 : 1, h) }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px]" aria-hidden="true">
        {trend.map((_, i) => (
          <div key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11px] text-muted">
            {b.label(i)}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Highest: {peso(max)}. Hover a bar for the exact amount.</p>
    </div>
  );
}

function Split({ rows, total, tone }) {
  if (!rows.length) return <p className="text-sm text-muted">No data.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((x) => {
        const share = total > 0 ? (x.amount / total) * 100 : 0;
        return (
          <li key={x.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold text-ink">{x.label}</span>
              <span className="num text-ink-2">
                <span className="font-bold text-ink">{share.toFixed(share >= 10 || share === 0 ? 0 : 1)}%</span> {peso(x.amount)}
              </span>
            </div>
            <Meter value={x.amount} max={total} tone={tone} />
            <p className="num mt-0.5 text-xs text-muted">{int(x.count)} transactions</p>
          </li>
        );
      })}
    </ul>
  );
}

function Ranked({ rows, value, sub, sku, crown, empty = 'Nothing yet.' }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ol className="space-y-1.5">
      {rows.map((x, i) => (
        <li key={x.sku || x.label} className={cx('flex items-center gap-3 rounded-xl px-2.5 py-2', i === 0 ? 'bg-turmeric-soft' : 'bg-sunken/70')}>
          <span className={cx('num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold', i === 0 ? 'bg-turmeric text-turmeric-ink' : 'bg-surface text-ink-2')}>
            {crown && i === 0 ? <Crown size={15} aria-label="Top" /> : i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-ink">{x.label}</span>
            {sku && x.sku && <Sku>{x.sku}</Sku>}
          </span>
          <span className="shrink-0 text-right">
            <span className="num block font-bold text-ink">{value(x)}</span>
            <span className="num block text-xs text-muted">{sub(x)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
