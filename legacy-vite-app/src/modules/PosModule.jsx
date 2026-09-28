import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  CircleCheck,
  CreditCard,
  FilePlus2,
  Landmark,
  MapPin,
  Minus,
  PackageOpen,
  Plus,
  Printer,
  Save,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  TriangleAlert,
  UserRoundCheck,
  Wallet,
} from 'lucide-react';
import { useApp } from '../lib/context';
import {
  componentDemand,
  computeCart,
  indexProducts,
  onHand,
  packageCapacity,
  resolveUnitPrice,
  shortfalls,
  stockStatus,
} from '../lib/pricing';
import { CUSTOMER_TIERS } from '../lib/seed';
import { amount, cleanSku, fmtClock, fmtDateTime, fmtLongDate, int, keyOf, norm, parseMoney, peso, round2 } from '../lib/format';
import { draftHasWork, newDraft } from '../lib/draft';
import { lsGet, lsSet, PREFS_KEY } from '../lib/storage';
import { LiveClock } from '../components/LiveClock';
import { Button, CategoryDot, cx, EmptyState, Field, IconButton, Input, Segmented, Select, Sku, useConfirm, useToast } from '../components/ui';
import { categoryHue } from '../lib/seed';

const PAY_ICONS = { cash: Banknote, gcash: Smartphone, gotyme: Wallet, 'bank transfer': Landmark };
const payIcon = (name) => PAY_ICONS[String(name).toLowerCase()] || CreditCard;

/** Suggested cash amounts: exact, then the next round 100 / 500 / 1,000. */
function quickCash(total) {
  if (!(total > 0)) return [];
  const out = [round2(total)];
  for (const step of [500, 1000, 100]) {
    const v = Math.ceil((total + 0.001) / step) * step;
    if (!out.includes(v) && out.length < 3) out.push(v);
  }
  return [out[0], ...out.slice(1).sort((a, b) => a - b)];
}

function validate({ draft, cart, demand, data, pm, tenderedNum, bySku }) {
  const e = {};
  if (!cart.lines.length) e.lines = 'Add at least one product to the order.';
  else if (cart.lines.some((l) => l.unavailable)) e.lines = 'Remove the products marked unavailable.';
  if (!norm(draft.customerName)) e.customerName = 'Enter the customer’s name.';
  if (!data.options.cashiers.includes(draft.cashier)) e.cashier = 'Choose the cashier station.';
  if (!pm) e.paymentMethod = 'Choose how the customer is paying.';
  if (draft.customerTier === 'Member' && !data.options.memberTiers.some((t) => t.name === draft.memberTier)) {
    e.memberTier = 'Choose the member tier.';
  }
  if (pm?.isCash && cart.lines.length) {
    if (!Number.isFinite(tenderedNum)) e.tendered = 'Enter the cash tendered.';
    else if (round2(tenderedNum) < cart.total) e.tendered = `Cash tendered is ${peso(cart.total - tenderedNum)} short of the total.`;
  }
  const short = shortfalls(demand, data.stock);
  if (short.length) {
    e.stock = short.map((s) => `${bySku[s.sku]?.name || s.sku}: this order needs ${s.need}, ${s.have} in stock.`).join(' ');
  }
  return e;
}

// ------------------------------------------------------------------ POS root
export default function PosModule() {
  const { data, dispatch, draft, setDraft, printSale } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [showErrors, setShowErrors] = useState(false);

  const bySku = useMemo(() => indexProducts(data.products), [data.products]);
  const tiers = data.options.memberTiers;
  const pm = data.options.paymentMethods.find((p) => p.name === draft.paymentMethod) || null;
  const locked = !!draft.savedAt;
  const savedSale = locked ? data.sales.find((s) => s.receiptNo === draft.receiptNo) : null;

  const ctx = { customerTier: draft.customerTier, memberTier: draft.memberTier, tiers };
  const cart = useMemo(() => computeCart(draft.lines, bySku, ctx), [draft.lines, bySku, draft.customerTier, draft.memberTier, tiers]); // eslint-disable-line react-hooks/exhaustive-deps
  const demand = useMemo(() => componentDemand(draft.lines, bySku), [draft.lines, bySku]);
  const available = useMemo(() => {
    const a = {};
    for (const p of data.products) if (!p.isPackage) a[p.sku] = onHand(data.stock[p.sku]) - (demand[p.sku] || 0);
    return a;
  }, [data.products, data.stock, demand]);

  const tenderedNum = pm?.isCash ? parseMoney(draft.tendered) : cart.total;
  const errors = locked ? {} : validate({ draft, cart, demand, data, pm, tenderedNum, bySku });
  const liveTenderError = !locked && draft.tendered !== '' ? errors.tendered : null;
  const shown = showErrors ? errors : { tendered: liveTenderError };

  const update = (patch) => setDraft((d) => (d.savedAt ? d : { ...d, ...patch }));

  // ---- cart actions
  const canAddOne = (sku) => {
    const p = bySku[sku];
    if (!p || p.active === false) return false;
    if (p.isPackage) return packageCapacity(p, available) >= 1;
    return (available[sku] ?? 0) >= 1;
  };
  const add = (sku) => {
    const p = bySku[sku];
    if (locked) {
      toast({ tone: 'info', title: 'This sale is already saved', message: 'Start a new transaction to ring up more items.' });
      return;
    }
    if (!canAddOne(sku)) {
      const detail = p?.isPackage
        ? `Not enough ${p.inclusions.map((i) => bySku[i.sku]?.name || i.sku).join(', ')} in stock for another ${p.name}.`
        : `No more ${p?.name || sku} in stock.`;
      toast({ tone: 'warn', title: 'Not enough stock', message: detail });
      return;
    }
    setDraft((d) => {
      const i = d.lines.findIndex((l) => l.sku === sku);
      const lines = i >= 0 ? d.lines.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l)) : [...d.lines, { sku, qty: 1 }];
      return { ...d, lines };
    });
  };
  const setQty = (idx, qty) => update({ lines: draft.lines.map((l, j) => (j === idx ? { ...l, qty: Math.max(1, Math.min(9999, qty)) } : l)) });
  const stepQty = (idx, dir) => {
    const line = draft.lines[idx];
    if (dir > 0 && !canAddOne(line.sku)) {
      toast({ tone: 'warn', title: 'Not enough stock', message: `You can’t add more ${bySku[line.sku]?.name || line.sku}.` });
      return;
    }
    if (dir < 0 && line.qty <= 1) return;
    setQty(idx, line.qty + dir);
  };
  const removeLine = (idx) => update({ lines: draft.lines.filter((_, j) => j !== idx) });

  // ---- save / print / new
  const save = async () => {
    if (locked) return;
    setShowErrors(true);
    const errs = validate({ draft, cart, demand, data, pm, tenderedNum, bySku });
    const msgs = Object.values(errs);
    if (msgs.length) {
      toast({ tone: 'bad', title: 'Sale not saved', message: msgs[0] });
      return;
    }
    const unpriced = cart.lines.filter((l) => l.chargedUnit <= 0);
    if (unpriced.length) {
      const ok = await confirm({
        title: 'Some items have no price',
        message: (
          <>
            <p>
              {unpriced.map((l) => l.name).join(', ')} {unpriced.length > 1 ? 'are' : 'is'} priced at ₱0.00. Set prices in Product
              master, or save this sale at ₱0.00 anyway.
            </p>
          </>
        ),
        confirmLabel: 'Save at ₱0.00',
      });
      if (!ok) return;
    }
    const now = new Date();
    const receiptNo = data.sales.some((s) => s.receiptNo === draft.receiptNo)
      ? newDraft(data.seq + 1).receiptNo
      : draft.receiptNo;
    const sale = {
      receiptNo,
      ts: now.toISOString(),
      customerName: norm(draft.customerName),
      leaderName: norm(draft.leaderName),
      uplineName: norm(draft.uplineName),
      customerTier: draft.customerTier,
      memberTier: draft.customerTier === 'Member' ? draft.memberTier : '',
      cashier: draft.cashier,
      paymentMethod: pm.name,
      isCash: !!pm.isCash,
      reference: pm.isCash ? '' : norm(draft.reference),
      items: cart.lines.map((l) => {
        const p = bySku[l.sku];
        return {
          sku: l.sku,
          name: l.name,
          category: l.category,
          isPackage: l.isPackage,
          qty: l.qty,
          unitPrice: l.unitPrice,
          chargedUnit: l.chargedUnit,
          gross: l.gross,
          discount: l.discount,
          net: l.net,
          rule: l.rule,
          inclusions: l.isPackage ? (p.inclusions || []).map((i) => ({ sku: i.sku, name: bySku[i.sku]?.name || i.sku, qty: i.qty })) : undefined,
        };
      }),
      deductions: demand,
      units: cart.units,
      grossTotal: cart.gross,
      discountTotal: cart.discount,
      totalDue: cart.total,
      tendered: pm.isCash ? round2(tenderedNum) : cart.total,
      change: pm.isCash ? round2(tenderedNum - cart.total) : 0,
      status: 'completed',
    };
    dispatch({ type: 'COMMIT_SALE', sale });
    setDraft((d) => ({ ...d, receiptNo, savedAt: sale.ts }));
    lsSet(PREFS_KEY, { ...lsGet(PREFS_KEY, {}), cashier: draft.cashier });
    setShowErrors(false);
    toast({ title: 'Sale saved', message: `Receipt ${receiptNo}. Stock was updated.` });
  };

  const startNew = async () => {
    if (draftHasWork(draft)) {
      const ok = await confirm({
        title: 'Discard this order?',
        message: 'This order hasn’t been saved. Its items and customer details will be cleared.',
        confirmLabel: 'Discard order',
        tone: 'danger',
      });
      if (!ok) return;
    }
    const defaultPm = data.options.paymentMethods.find((p) => p.isCash)?.name || data.options.paymentMethods[0]?.name || '';
    setDraft(newDraft(data.seq + 1, draft.cashier, defaultPm));
    setShowErrors(false);
  };

  // Rendered lines: from the saved sale once saved, otherwise live.
  const view = savedSale
    ? {
        lines: savedSale.items.map((it, index) => ({ ...it, index, unavailable: false })),
        gross: savedSale.grossTotal,
        discount: savedSale.discountTotal,
        total: savedSale.totalDue,
        tendered: savedSale.tendered,
        change: savedSale.change,
        isCash: savedSale.isCash,
      }
    : {
        ...cart,
        tendered: pm?.isCash ? (Number.isFinite(tenderedNum) ? tenderedNum : 0) : cart.total,
        change: pm?.isCash && Number.isFinite(tenderedNum) ? Math.max(0, round2(tenderedNum - cart.total)) : 0,
        isCash: pm ? !!pm.isCash : true,
      };

  return (
    <div className="xl:grid xl:h-full xl:grid-cols-[minmax(0,1fr)_minmax(470px,min(43%,640px))]">
      <div className="min-w-0 space-y-4 p-4 sm:p-6 xl:overflow-y-auto">
        <TransactionBar draft={draft} locked={locked} savedSale={savedSale} errors={shown} onCashier={(c) => update({ cashier: c })} />
        <CustomerPanel draft={draft} locked={locked} errors={shown} update={update} />
        <Catalog bySku={bySku} available={available} ctx={ctx} draft={draft} locked={locked} onAdd={add} />
      </div>
      <Ticket
        draft={draft}
        view={view}
        demand={demand}
        locked={locked}
        savedSale={savedSale}
        pm={pm}
        errors={shown}
        allErrors={errors}
        showErrors={showErrors}
        update={update}
        onStep={stepQty}
        onQty={setQty}
        onRemove={removeLine}
        onSave={save}
        onPrint={() => savedSale && printSale(savedSale)}
        onNew={startNew}
        canAddOne={canAddOne}
      />
    </div>
  );
}

// ------------------------------------------------------------ Transaction bar
function TransactionBar({ draft, locked, savedSale, errors, onCashier }) {
  const { data } = useApp();
  const known = data.options.cashiers.includes(draft.cashier);
  return (
    <section aria-label="Transaction" className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">Receipt no.</p>
        <p className="font-mono text-[16px] font-semibold tracking-tight text-ink">{draft.receiptNo}</p>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">{locked ? 'Saved' : 'Date & time'}</p>
        {locked && savedSale ? (
          <p className="num text-[16px] font-bold text-ink">{fmtDateTime(savedSale.ts)}</p>
        ) : (
          <LiveClock
            render={(now) => (
              <p className="num text-[16px] font-bold text-ink">
                {now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}, {fmtClock(now)}
              </p>
            )}
          />
        )}
      </div>
      <div className="ml-auto w-full min-w-[180px] sm:w-auto">
        <label htmlFor="pos-cashier" className="text-xs font-semibold text-muted">
          Cashier
        </label>
        <div className="relative mt-0.5">
          <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-leaf" aria-hidden="true" />
          <Select
            id="pos-cashier"
            value={known ? draft.cashier : ''}
            disabled={locked}
            invalid={!!errors.cashier}
            onChange={(e) => onCashier(e.target.value)}
            className="h-10 pl-9 font-semibold sm:w-56"
          >
            <option value="">Choose cashier</option>
            {data.options.cashiers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        {errors.cashier && <p className="mt-1 text-sm font-medium text-bad">{errors.cashier}</p>}
      </div>
    </section>
  );
}

// ------------------------------------------------------------ Customer panel
function uniqueNames(sales, field, limit = 300) {
  const seen = new Set();
  const out = [];
  for (let i = sales.length - 1; i >= 0 && out.length < limit; i--) {
    const v = norm(sales[i][field]);
    const k = v.toLowerCase();
    if (v && !seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

function TierPips({ n, on }) {
  return (
    <span className="flex items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: Math.min(5, n) }).map((_, i) => (
        <span key={i} className={cx('h-[5px] w-[5px] rounded-full', on ? 'bg-leaf-ink' : 'bg-leaf/70')} />
      ))}
    </span>
  );
}

function CustomerPanel({ draft, locked, errors, update }) {
  const { data } = useApp();
  const names = useMemo(
    () => ({
      customers: uniqueNames(data.sales, 'customerName'),
      leaders: uniqueNames(data.sales, 'leaderName'),
      uplines: uniqueNames(data.sales, 'uplineName'),
    }),
    [data.sales],
  );
  const lastVisit = useMemo(() => {
    if (locked) return null;
    const k = keyOf(draft.customerName);
    if (!k) return null;
    for (let i = data.sales.length - 1; i >= 0; i--) {
      const s = data.sales[i];
      if (s.status !== 'void' && keyOf(s.customerName) === k) return s;
    }
    return null;
  }, [data.sales, draft.customerName, locked]);
  const differs =
    lastVisit &&
    (lastVisit.customerTier !== draft.customerTier ||
      (lastVisit.memberTier || '') !== (draft.customerTier === 'Member' ? draft.memberTier : '') ||
      keyOf(lastVisit.leaderName) !== keyOf(draft.leaderName) ||
      keyOf(lastVisit.uplineName) !== keyOf(draft.uplineName));

  const tiers = data.options.memberTiers;
  const isMember = draft.customerTier === 'Member';

  return (
    <section aria-label="Customer" className="rounded-2xl border border-line bg-surface p-4 sm:px-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Customer name" htmlFor="c-name" required error={errors.customerName} className="sm:col-span-2 lg:col-span-1">
          <Input
            id="c-name"
            list="dl-customers"
            value={draft.customerName}
            disabled={locked}
            invalid={!!errors.customerName}
            autoComplete="off"
            placeholder="Full name"
            onChange={(e) => update({ customerName: e.target.value })}
          />
        </Field>
        <Field label="Leader’s name" htmlFor="c-leader">
          <Input
            id="c-leader"
            list="dl-leaders"
            value={draft.leaderName}
            disabled={locked}
            autoComplete="off"
            placeholder="Leader"
            onChange={(e) => update({ leaderName: e.target.value })}
          />
        </Field>
        <Field label="Upline’s name" htmlFor="c-upline">
          <Input
            id="c-upline"
            list="dl-uplines"
            value={draft.uplineName}
            disabled={locked}
            autoComplete="off"
            placeholder="Upline"
            onChange={(e) => update({ uplineName: e.target.value })}
          />
        </Field>
      </div>
      <datalist id="dl-customers">{names.customers.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="dl-leaders">{names.leaders.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="dl-uplines">{names.uplines.map((n) => <option key={n} value={n} />)}</datalist>

      {differs && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-leaf-soft px-3 py-2.5 text-sm text-ink">
          <UserRoundCheck size={18} className="shrink-0 text-leaf" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            Returning customer. Last visit {fmtLongDate(lastVisit.ts)}: {lastVisit.customerTier}
            {lastVisit.memberTier ? ` (${lastVisit.memberTier})` : ''}
            {lastVisit.leaderName ? `, leader ${lastVisit.leaderName}` : ''}
            {lastVisit.uplineName ? `, upline ${lastVisit.uplineName}` : ''}.
          </p>
          <Button
            size="sm"
            variant="leaf"
            onClick={() =>
              update({
                customerName: lastVisit.customerName,
                customerTier: lastVisit.customerTier,
                memberTier: lastVisit.memberTier || '',
                leaderName: lastVisit.leaderName || '',
                uplineName: lastVisit.uplineName || '',
              })
            }
          >
            Use these details
          </Button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink-2">Customer tier</p>
          <Segmented
            ariaLabel="Customer tier"
            size="sm"
            value={draft.customerTier}
            disabled={locked}
            onChange={(v) => update({ customerTier: v, memberTier: v === 'Member' ? draft.memberTier : '' })}
            options={CUSTOMER_TIERS.map((t) => ({ value: t, label: t }))}
          />
        </div>
        <div className="min-w-0">
          <p className={cx('mb-1.5 text-sm font-semibold', isMember ? 'text-ink-2' : 'text-muted')}>
            Member tier {isMember ? <span className="text-bad" aria-hidden="true">*</span> : <span className="font-normal">(members only)</span>}
          </p>
          <Segmented
            ariaLabel="Member tier"
            size="sm"
            value={isMember ? draft.memberTier : ''}
            disabled={locked || !isMember}
            invalid={!!errors.memberTier}
            onChange={(v) => update({ memberTier: v })}
            options={tiers.map((t, i) => ({
              value: t.name,
              render: (on) => (
                <span className="flex items-center gap-1.5">
                  <TierPips n={i + 1} on={on} />
                  {t.name}
                </span>
              ),
            }))}
          />
          {errors.memberTier && <p className="mt-1 text-sm font-medium text-bad">{errors.memberTier}</p>}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Catalog
function Catalog({ bySku, available, ctx, draft, locked, onAdd }) {
  const { data, go } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const searchRef = useRef(null);
  const active = data.products.filter((p) => p.active !== false);
  const cats = data.categories.filter((c) => active.some((p) => p.category === c.name));
  const qk = q.trim().toLowerCase();
  const visible = active.filter(
    (p) => (cat === 'All' || p.category === cat) && (!qk || p.name.toLowerCase().includes(qk) || p.sku.toLowerCase().includes(qk)),
  );
  const inCart = {};
  for (const l of draft.lines) inCart[l.sku] = (inCart[l.sku] || 0) + l.qty;
  const unpriced = active.filter((p) => !(p.price > 0)).length;

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !typing && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onEnter = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const exact = bySku[cleanSku(q)];
    const pick = exact && exact.active !== false ? exact : visible.length === 1 ? visible[0] : null;
    if (pick) {
      onAdd(pick.sku);
      setQ('');
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:px-5" aria-label="Products">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Products</h2>
        {unpriced > 0 && (
          <button type="button" onClick={() => go('products')} className="rounded-full bg-turmeric-soft px-3 py-1 text-xs font-bold text-turmeric-ink hover:underline">
            {unpriced} without a price — set prices
          </button>
        )}
      </div>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <Input
          ref={searchRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onEnter}
          className="pl-10"
          placeholder="Search name or SKU, or scan a barcode"
          aria-label="Search products"
          disabled={locked}
        />
      </div>
      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by category">
        {['All', ...cats.map((c) => c.name)].map((c) => {
          const on = c === cat;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => setCat(c)}
              className={cx(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf',
                on ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken',
              )}
            >
              {c !== 'All' && <CategoryDot category={c} />}
              {c}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Search} title="No products match">
          Try a shorter search, or pick another category.
        </EmptyState>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4">
          {visible.map((p) => (
            <ProductTile key={p.sku} p={p} bySku={bySku} available={available} ctx={ctx} inCart={inCart[p.sku] || 0} locked={locked} onAdd={onAdd} />
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Tip: press / to jump to search. Typing an exact SKU and pressing Enter adds it.</p>
    </section>
  );
}

function ProductTile({ p, bySku, available, ctx, inCart, locked, onAdd }) {
  const { retail, unit } = resolveUnitPrice(p, ctx);
  let stockLine;
  let canAdd;
  if (p.isPackage) {
    const cap = packageCapacity(p, available);
    canAdd = cap >= 1;
    const incl = p.inclusions.map((i) => `${i.qty}× ${bySku[i.sku]?.name || i.sku}`).join(', ') || 'No stock items';
    stockLine = (
      <>
        <span className="block truncate text-xs text-muted" title={incl}>
          {incl}
        </span>
        <span className={cx('text-xs font-bold', canAdd ? 'text-muted' : 'text-bad')}>
          {cap === Infinity ? 'Always available' : canAdd ? `Can sell ${int(cap)}` : 'Contents out of stock'}
        </span>
      </>
    );
  } else {
    const left = available[p.sku] ?? 0;
    canAdd = left >= 1;
    const st = stockStatus(left, p.reorderLevel);
    stockLine = (
      <span className={cx('text-xs font-bold', st === 'out' ? 'text-bad' : st === 'low' ? 'text-warn' : 'text-muted')}>
        {st === 'out' ? 'Out of stock' : `${int(left)} left`}
      </span>
    );
  }
  const disabled = locked || !canAdd;
  return (
    <button
      type="button"
      onClick={() => onAdd(p.sku)}
      disabled={disabled}
      aria-label={`Add ${p.name}`}
      className={cx(
        'group relative flex min-h-[124px] flex-col overflow-hidden rounded-xl border bg-surface py-3 pl-4 pr-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf',
        inCart ? 'border-leaf/70 bg-leaf-soft/50' : 'border-line hover:border-leaf/50 hover:bg-sunken',
        disabled && 'cursor-not-allowed opacity-55 hover:border-line hover:bg-surface',
      )}
    >
      <span className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: categoryHue(p.category) }} aria-hidden="true" />
      <span className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 font-bold leading-snug text-ink">{p.name}</span>
        {inCart > 0 && (
          <span className="num -mr-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-leaf px-1.5 text-xs font-bold text-leaf-ink" aria-label={`${inCart} in order`}>
            {inCart}
          </span>
        )}
      </span>
      <Sku className="mt-0.5">{p.sku}</Sku>
      <span className="mt-auto pt-2">
        <span className="flex flex-wrap items-baseline gap-x-2">
          {unit > 0 ? (
            <>
              <span className="num text-[15px] font-extrabold text-ink">{peso(unit)}</span>
              {unit < retail && <span className="num text-xs text-muted line-through">{peso(retail)}</span>}
            </>
          ) : (
            <span className="text-sm font-bold text-warn">No price set</span>
          )}
        </span>
        <span className="mt-0.5 block">{stockLine}</span>
      </span>
    </button>
  );
}

// ------------------------------------------------------------------- Ticket
function QtyInput({ value, onCommit, disabled, label }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="num h-8 w-12 rounded-lg border border-line-strong bg-surface text-center text-[15px] font-bold text-ink focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/30 disabled:bg-transparent disabled:border-transparent"
      inputMode="numeric"
      aria-label={label}
      value={text}
      disabled={disabled}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, '').slice(0, 4);
        setText(t);
        const n = parseInt(t, 10);
        if (n >= 1) onCommit(n);
      }}
      onBlur={() => {
        if (!(parseInt(text, 10) >= 1)) setText(String(value));
      }}
    />
  );
}

function Ticket({
  draft,
  view,
  demand,
  locked,
  savedSale,
  pm,
  errors,
  allErrors,
  showErrors,
  update,
  onStep,
  onQty,
  onRemove,
  onSave,
  onPrint,
  onNew,
  canAddOne,
}) {
  const { data } = useApp();
  const bySku = useMemo(() => indexProducts(data.products), [data.products]);
  const tenderRef = useRef(null);
  const short = new Set(shortfalls(demand, data.stock).map((s) => s.sku));
  const lineShort = (l) => {
    const p = bySku[l.sku];
    if (locked || !p) return false;
    return p.isPackage ? p.inclusions.some((i) => short.has(i.sku)) : short.has(l.sku);
  };
  const suggestions = quickCash(view.total);
  const errorList = showErrors ? Object.values(allErrors) : [];

  return (
    <aside
      className="flex min-w-0 flex-col border-t border-line bg-surface xl:h-full xl:overflow-hidden xl:border-l xl:border-t-0"
      aria-label="Current order"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ShoppingCart size={20} className="text-leaf" aria-hidden="true" />
          Order
          {view.lines.length > 0 && <span className="num text-sm font-semibold text-muted">({int(view.lines.reduce((a, l) => a + l.qty, 0))} items)</span>}
        </h2>
        {!locked && view.lines.length > 0 && (
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => update({ lines: [] })}>
            Clear
          </Button>
        )}
      </div>

      {locked && (
        <div className="flex items-start gap-3 border-b border-ok/30 bg-ok-soft px-4 py-3 sm:px-5" role="status">
          <CircleCheck size={22} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="font-bold text-ink">
              {savedSale?.status === 'void' ? 'Saved, then voided' : 'Sale saved'} at {savedSale ? fmtClock(savedSale.ts) : ''}
            </p>
            <p className="text-ink-2">Receipt {draft.receiptNo}. Print the receipt, then start a new transaction.</p>
          </div>
        </div>
      )}

      <div className="min-h-[180px] flex-1 overflow-auto xl:min-h-0">
        {view.lines.length === 0 ? (
          <EmptyState icon={PackageOpen} title="No items yet" className="py-12">
            Tap a product to add it. Packages deduct their contents from stock automatically.
          </EmptyState>
        ) : (
          <table className="w-full min-w-[430px] text-sm">
            <thead className="sticky top-0 z-[1] bg-surface">
              <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                <th scope="col" className="py-2 pl-4 pr-1 sm:pl-5">#</th>
                <th scope="col" className="px-2 py-2">Product</th>
                <th scope="col" className="px-2 py-2 text-right">Unit price</th>
                <th scope="col" className="px-1 py-2 text-center">Qty</th>
                <th scope="col" className="px-2 py-2 text-right">Subtotal</th>
                <th scope="col" className="px-2 py-2 text-right">Discount</th>
                <th scope="col" className="py-2 pl-1 pr-3 sm:pr-4">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.lines.map((l, i) => {
                const bad = lineShort(l) || l.unavailable;
                return (
                  <tr key={`${l.sku}-${i}`} className={cx('border-b border-line align-top', bad && 'bg-bad-soft')}>
                    <td className="num py-2.5 pl-4 pr-1 text-muted sm:pl-5">{i + 1}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-start gap-2">
                        <CategoryDot category={l.category} className="mt-1.5" />
                        <div className="min-w-0">
                          <p className="font-semibold leading-snug text-ink">{l.name}</p>
                          <Sku>{l.sku}</Sku>
                          {l.isPackage && (bySku[l.sku]?.inclusions?.length > 0 || l.inclusions?.length > 0) && (
                            <p className="text-xs text-muted">
                              Deducts{' '}
                              {(l.inclusions || bySku[l.sku].inclusions)
                                .map((x) => `${x.qty * l.qty}× ${x.name || bySku[x.sku]?.name || x.sku}`)
                                .join(', ')}
                            </p>
                          )}
                          {bad && <p className="text-xs font-bold text-bad">{l.unavailable ? 'No longer sold' : 'Not enough stock'}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="num whitespace-nowrap px-2 py-2.5 text-right">{amount(l.unitPrice)}</td>
                    <td className="px-1 py-2">
                      <div className="flex items-center justify-center gap-0.5">
                        {!locked && (
                          <IconButton icon={Minus} label={`One less ${l.name}`} size={28} onClick={() => onStep(i, -1)} disabled={l.qty <= 1} />
                        )}
                        <QtyInput value={l.qty} disabled={locked} label={`Quantity of ${l.name}`} onCommit={(n) => onQty(i, n)} />
                        {!locked && (
                          <IconButton icon={Plus} label={`One more ${l.name}`} size={28} onClick={() => onStep(i, 1)} disabled={!canAddOne(l.sku)} />
                        )}
                      </div>
                    </td>
                    <td className="num whitespace-nowrap px-2 py-2.5 text-right font-semibold">{amount(l.gross)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right">
                      {l.discount > 0 ? <span className="num font-semibold text-ok">−{amount(l.discount)}</span> : <span className="text-muted">—</span>}
                      {l.discount > 0 && <p className="text-[11px] leading-tight text-muted">{l.rule}</p>}
                    </td>
                    <td className="py-2 pl-1 pr-3 sm:pr-4">
                      {!locked && <IconButton icon={Trash2} label={`Remove ${l.name}`} size={30} tone="danger" onClick={() => onRemove(i)} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="receipt-edge border-t border-dashed border-line-strong px-4 pb-4 pt-3 sm:px-5">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-sunken px-3 py-2">
            <p className="text-xs font-semibold text-muted">Gross total</p>
            <p className="num text-lg font-bold text-ink">{peso(view.gross)}</p>
          </div>
          <div className="rounded-xl bg-sunken px-3 py-2">
            <p className="text-xs font-semibold text-muted">Member discount</p>
            <p className={cx('num text-lg font-bold', view.discount > 0 ? 'text-ok' : 'text-ink')}>
              {view.discount > 0 ? `−${peso(view.discount)}` : peso(0)}
            </p>
          </div>
        </div>

        <div className="pole mt-2 rounded-2xl bg-display px-4 pb-3 pt-3 text-display-ink" aria-live="polite">
          <div className="flex items-end justify-between gap-3">
            <span className="pb-1.5 text-sm font-semibold text-display-dim">Total due</span>
            <span className="pole-figure num text-[40px] font-extrabold leading-none tracking-tight sm:text-[46px]">{peso(view.total)}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-display-dim/25 pt-2.5">
            <div>
              <p className="text-xs font-semibold text-display-dim">{view.isCash ? 'Cash tendered' : 'Amount received'}</p>
              <p className="num text-xl font-bold">{peso(view.tendered)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-display-dim">Change</p>
              <p className="pole-figure num text-[26px] font-extrabold leading-tight">{peso(view.change)}</p>
            </div>
          </div>
        </div>

        {!locked && (
          <div className="mt-3 space-y-3">
            <div>
              <p className="mb-1.5 text-sm font-semibold text-ink-2">Payment method</p>
              <Segmented
                ariaLabel="Payment method"
                size="sm"
                value={draft.paymentMethod}
                invalid={!!errors.paymentMethod}
                onChange={(v) => {
                  const m = data.options.paymentMethods.find((x) => x.name === v);
                  update({ paymentMethod: v, ...(m?.isCash ? {} : { tendered: '' }) });
                  if (m?.isCash) setTimeout(() => tenderRef.current?.focus(), 30);
                }}
                options={data.options.paymentMethods.map((m) => ({ value: m.name, label: m.name, icon: payIcon(m.name) }))}
              />
              {errors.paymentMethod && <p className="mt-1 text-sm font-medium text-bad">{errors.paymentMethod}</p>}
            </div>
            {pm?.isCash !== false ? (
              <Field label="Cash tendered" htmlFor="tendered" error={errors.tendered}>
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-[140px] flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted">₱</span>
                    <Input
                      id="tendered"
                      ref={tenderRef}
                      inputMode="decimal"
                      value={draft.tendered}
                      invalid={!!errors.tendered}
                      placeholder="0.00"
                      className="num pl-8 text-lg font-bold"
                      onChange={(e) => update({ tendered: e.target.value.replace(/[^\d.,]/g, '') })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onSave();
                      }}
                    />
                  </div>
                  {suggestions.map((v, i) => (
                    <Button key={v} size="md" variant="secondary" className="num px-3" onClick={() => update({ tendered: String(v) })}>
                      {i === 0 ? 'Exact' : peso(v).replace('.00', '')}
                    </Button>
                  ))}
                </div>
              </Field>
            ) : (
              <Field label="Reference no." htmlFor="ref" hint={`Optional. The ${pm.name} transaction reference, for matching payments later.`}>
                <Input id="ref" value={draft.reference} onChange={(e) => update({ reference: e.target.value })} placeholder="e.g. 1234 567 890" />
              </Field>
            )}
          </div>
        )}

        {errorList.length > 0 && (
          <div className="mt-3 rounded-xl border border-bad/40 bg-bad-soft px-3 py-2.5 text-sm" role="alert">
            <p className="flex items-center gap-2 font-bold text-bad">
              <TriangleAlert size={16} aria-hidden="true" /> Fix these to save the sale
            </p>
            <ul className="mt-1 space-y-0.5 text-ink">
              {errorList.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="primary" size="lg" icon={locked ? CircleCheck : Save} className="col-span-2" onClick={onSave} disabled={locked}>
            {locked ? 'Saved' : 'Save sale'}
          </Button>
          <Button variant={locked ? 'primary' : 'secondary'} size="lg" icon={Printer} onClick={onPrint} disabled={!locked} title={locked ? 'Print customer and cashier copies' : 'Save the sale first'}>
            Print
          </Button>
          <Button variant={locked ? 'leaf' : 'secondary'} size="lg" icon={FilePlus2} onClick={onNew}>
            New transaction
          </Button>
        </div>
      </div>
    </aside>
  );
}
