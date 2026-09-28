'use client';

// Ported from legacy-vite-app/src/modules/PosModule.jsx (SPEC §10 — layout
// and interaction port over, minimal change; the reducer/dispatch model is
// replaced by direct calls into the new data layer). Kept as one file,
// matching the legacy module's own single-file structure.
//
// What changed vs. legacy, deliberately:
//   - No cashier-station picker: the cashier IS the signed-in user
//     (SPEC §9). A branch picker replaces it for owner/an all-branch
//     manager, who — unlike a single-branch cashier — must say which
//     branch's stock a sale draws from.
//   - The receipt number isn't known until the server issues it inside
//     commit_sale; the ticket shows "Not yet assigned" until saved.
//   - Customer/leader/upline autocomplete and the "returning customer"
//     hint query the server (lib/data/sales.ts) instead of scanning an
//     in-memory sales array.
//   - No single-tab lock (golden rule §7) — concurrent cashiers are normal.
import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  componentDemand,
  computeCart,
  indexProducts,
  packageCapacity,
  resolveUnitPrice,
  stockStatus,
} from '@/lib/pricing';
import { amount, cleanSku, fmtClock, fmtLongDate, int, keyOf, norm, parseMoney, peso, round2 } from '@/lib/format';
import { LiveClock } from '@/components/LiveClock';
import { Button, CategoryDot, cx, EmptyState, Field, IconButton, Input, Segmented, Select, Sku, useConfirm, useToast } from '@/components/ui';
import { categoryHue } from '@/lib/category';
import { useCatalog } from '@/components/providers/catalog-provider';
import { useLiveStock } from '@/lib/hooks/use-live-stock';
import { usePrint } from '@/components/receipt/print-provider';
import { createClient } from '@/lib/supabase/client';
import { commitSale } from '@/lib/rpc/commit-sale';
import { RpcError, shortfalls as rpcShortfalls } from '@/lib/rpc/errors';
import { fetchLastVisit, fetchRecentNames, fetchSaleWithItems } from '@/lib/data/sales';
import type { Profile } from '@/lib/auth';
import type { CustomerTier, Product, Sale } from '@/lib/types';

const CUSTOMER_TIERS: CustomerTier[] = ['New', 'Member'];
const PAY_ICONS: Record<string, typeof Banknote> = { cash: Banknote, gcash: Smartphone, gotyme: Wallet, 'bank transfer': Landmark };
const payIcon = (name: string) => PAY_ICONS[name.toLowerCase()] ?? CreditCard;

interface Line {
  sku: string;
  productId: string;
  qty: number;
}

interface Draft {
  clientRef: string;
  branchId: string | null;
  customerName: string;
  leaderName: string;
  uplineName: string;
  customerTier: CustomerTier;
  memberTier: string;
  paymentMethodId: string;
  tendered: string;
  reference: string;
  lines: Line[];
  /** Set once commit_sale has actually succeeded — locks the ticket. */
  saved: Sale | null;
}

function newDraft(branchId: string | null, paymentMethodId: string): Draft {
  return {
    clientRef: crypto.randomUUID(),
    branchId,
    customerName: '',
    leaderName: '',
    uplineName: '',
    customerTier: 'New',
    memberTier: '',
    paymentMethodId,
    tendered: '',
    reference: '',
    lines: [],
    saved: null,
  };
}

const draftHasWork = (d: Draft) => !d.saved && (d.lines.length > 0 || !!d.customerName.trim() || !!d.leaderName.trim() || !!d.uplineName.trim());

/** Suggested cash amounts: exact, then the next round 100 / 500 / 1,000. */
function quickCash(total: number): number[] {
  if (!(total > 0)) return [];
  const out = [round2(total)];
  for (const step of [500, 1000, 100]) {
    const v = Math.ceil((total + 0.001) / step) * step;
    if (!out.includes(v) && out.length < 3) out.push(v);
  }
  return [out[0], ...out.slice(1).sort((a, b) => a - b)];
}

export function PosClient({ profile }: { profile: Profile }) {
  const { products, memberTiers, paymentMethods, branches } = useCatalog();
  const stock = useLiveStock();
  const { printSale } = usePrint();
  const toast = useToast();
  const confirm = useConfirm();
  const supabase = useMemo(() => createClient(), []);

  const bySku = useMemo(() => indexProducts(products) as Record<string, Product>, [products]);
  const [draft, setDraft] = useState<Draft>(() => newDraft(profile.branch_id, ''));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  // Payment methods are empty on the very first render (the catalog hasn't
  // loaded yet), so the draft can't pick a default up front. Computed here
  // instead of an effect + setState: once methods load, this just IS the
  // right id on the very next render, no extra render cycle needed.
  const defaultPmId = paymentMethods.find((p) => p.isCash)?.id ?? paymentMethods[0]?.id ?? '';
  const effectivePmId = draft.paymentMethodId || defaultPmId;
  const pm = paymentMethods.find((p) => p.id === effectivePmId) ?? null;
  const locked = !!draft.saved;
  const branchId = draft.branchId;

  const ctx = { customerTier: draft.customerTier, memberTier: draft.memberTier, tiers: memberTiers };
  const cartLines = useMemo(() => draft.lines.map((l) => ({ sku: l.sku, qty: l.qty })), [draft.lines]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx is rebuilt every render on purpose (legacy did the same, deps list its actual pieces)
  const cart = useMemo(() => computeCart(cartLines, bySku, ctx), [cartLines, bySku, draft.customerTier, draft.memberTier, memberTiers]);
  const demand = useMemo(() => componentDemand(cartLines, bySku) as Record<string, number>, [cartLines, bySku]);
  const available = useMemo(() => {
    const a: Record<string, number> = {};
    if (!branchId) return a;
    for (const p of products) if (!p.isPackage) a[p.sku] = stock.onHand(branchId, p.id) - (demand[p.sku] || 0);
    return a;
  }, [products, branchId, stock, demand]);

  const tenderedNum = pm?.isCash ? parseMoney(draft.tendered) : cart.total;
  const errors = locked ? {} : validate({ draft, cart, demand, available, pm, tenderedNum, bySku, branchId });
  const liveTenderError = !locked && draft.tendered !== '' ? errors.tendered : null;
  const shown: Record<string, string | undefined> = showErrors ? errors : { tendered: liveTenderError ?? undefined };

  const update = (patch: Partial<Draft>) => setDraft((d) => (d.saved ? d : { ...d, ...patch }));

  const canAddOne = (sku: string) => {
    const p = bySku[sku];
    if (!p || p.active === false || !branchId) return false;
    if (p.isPackage) return packageCapacity(p, available) >= 1;
    return (available[sku] ?? 0) >= 1;
  };
  const add = (sku: string) => {
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
      const lines =
        i >= 0 ? d.lines.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l)) : [...d.lines, { sku, productId: p.id, qty: 1 }];
      return { ...d, lines };
    });
  };
  const setQty = (idx: number, qty: number) =>
    update({ lines: draft.lines.map((l, j) => (j === idx ? { ...l, qty: Math.max(1, Math.min(9999, qty)) } : l)) });
  const stepQty = (idx: number, dir: 1 | -1) => {
    const line = draft.lines[idx];
    if (dir > 0 && !canAddOne(line.sku)) {
      toast({ tone: 'warn', title: 'Not enough stock', message: `You can’t add more ${bySku[line.sku]?.name || line.sku}.` });
      return;
    }
    if (dir < 0 && line.qty <= 1) return;
    setQty(idx, line.qty + dir);
  };
  const removeLine = (idx: number) => update({ lines: draft.lines.filter((_, j) => j !== idx) });

  const save = async () => {
    if (locked || saving) return;
    setShowErrors(true);
    const errs = validate({ draft, cart, demand, available, pm, tenderedNum, bySku, branchId });
    const msgs = Object.values(errs).filter(Boolean) as string[];
    if (msgs.length) {
      toast({ tone: 'bad', title: 'Sale not saved', message: msgs[0] });
      return;
    }
    const unpriced = cart.lines.filter((l: { chargedUnit: number }) => l.chargedUnit <= 0);
    if (unpriced.length) {
      const ok = await confirm({
        title: 'Some items have no price',
        message: `${unpriced.map((l: { name: string }) => l.name).join(', ')} ${unpriced.length > 1 ? 'are' : 'is'} priced at ₱0.00. Set prices in Product master, or save this sale at ₱0.00 anyway.`,
        confirmLabel: 'Save at ₱0.00',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const saved = await commitSale(supabase, {
        clientRef: draft.clientRef,
        branchId: branchId ?? undefined,
        customerName: draft.customerName,
        leaderName: draft.leaderName,
        uplineName: draft.uplineName,
        customerTier: draft.customerTier,
        memberTier: draft.customerTier === 'Member' ? draft.memberTier : undefined,
        paymentMethodId: effectivePmId,
        tendered: pm?.isCash ? round2(tenderedNum) : undefined,
        reference: pm?.isCash ? undefined : draft.reference,
        expectedTotal: cart.total,
        lines: draft.lines.map((l) => ({ productId: l.productId, qty: l.qty })),
      });
      const full = (await fetchSaleWithItems(supabase, saved.id)) ?? saved;
      setDraft((d) => ({ ...d, saved: full }));
      setShowErrors(false);
      toast({ title: 'Sale saved', message: `Receipt ${full.receiptNo}. Stock was updated.` });
    } catch (err) {
      if (err instanceof RpcError) {
        if (err.hint === 'insufficient_stock') {
          const short = rpcShortfalls(err);
          toast({ tone: 'bad', title: 'Not enough stock', message: short.map((s) => `${s.name}: needs ${s.need}, ${s.have} in stock.`).join(' ') });
        } else if (err.hint === 'price_mismatch') {
          toast({ tone: 'bad', title: 'Prices changed', message: 'Someone updated a price while this ticket was open. Review the ticket and save again.' });
        } else {
          toast({ tone: 'bad', title: 'Sale not saved', message: err.message });
        }
      } else {
        toast({ tone: 'bad', title: 'Sale not saved', message: 'Check the connection and try again — nothing was lost.' });
      }
    } finally {
      setSaving(false);
    }
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
    const defaultPm = paymentMethods.find((p) => p.isCash)?.name ? (paymentMethods.find((p) => p.isCash)?.id ?? '') : (paymentMethods[0]?.id ?? '');
    setDraft(newDraft(branchId, defaultPm));
    setShowErrors(false);
  };

  const view = draft.saved
    ? {
        lines: (draft.saved.items ?? []).map((it, index) => ({ ...it, index, unavailable: false })),
        gross: draft.saved.grossTotal,
        discount: draft.saved.discountTotal,
        total: draft.saved.totalDue,
        tendered: draft.saved.tendered,
        change: draft.saved.change,
        isCash: draft.saved.isCash,
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
        <TransactionBar
          draft={draft}
          locked={locked}
          receiptNo={draft.saved?.receiptNo ?? null}
          branches={branches}
          cashierName={profile.full_name}
          fixedBranch={profile.branch_id}
          errors={shown}
          onBranch={(id) => update({ branchId: id })}
        />
        <CustomerPanel draft={draft} locked={locked} errors={shown} update={update} supabase={supabase} />
        <Catalog bySku={bySku} products={products} available={available} branchReady={!!branchId} ctx={ctx} draft={draft} locked={locked} onAdd={add} />
      </div>
      <Ticket
        draft={draft}
        view={view}
        demand={demand}
        available={available}
        locked={locked}
        saving={saving}
        pm={pm}
        paymentMethods={paymentMethods}
        errors={shown}
        allErrors={errors}
        showErrors={showErrors}
        update={update}
        onStep={stepQty}
        onQty={setQty}
        onRemove={removeLine}
        onSave={save}
        onPrint={() => draft.saved && printSale(draft.saved)}
        onNew={startNew}
        canAddOne={canAddOne}
      />
    </div>
  );
}

// ---------------------------------------------------------------- validate
interface ValidateArgs {
  draft: Draft;
  cart: ReturnType<typeof computeCart>;
  demand: Record<string, number>;
  available: Record<string, number>;
  pm: { id: string; isCash: boolean } | null;
  tenderedNum: number;
  bySku: Record<string, Product>;
  branchId: string | null;
}

function validate({ draft, cart, demand, available, pm, tenderedNum, bySku, branchId }: ValidateArgs): Record<string, string> {
  const e: Record<string, string> = {};
  if (!branchId) e.branch = 'Choose which branch this sale is for.';
  if (!cart.lines.length) e.lines = 'Add at least one product to the order.';
  else if (cart.lines.some((l: { unavailable: boolean }) => l.unavailable)) e.lines = 'Remove the products marked unavailable.';
  if (!norm(draft.customerName)) e.customerName = 'Enter the customer’s name.';
  if (!pm) e.paymentMethod = 'Choose how the customer is paying.';
  if (draft.customerTier === 'Member' && !draft.memberTier) e.memberTier = 'Choose the member tier.';
  if (pm?.isCash && cart.lines.length) {
    if (!Number.isFinite(tenderedNum)) e.tendered = 'Enter the cash tendered.';
    else if (round2(tenderedNum) < cart.total) e.tendered = `Cash tendered is ${peso(cart.total - tenderedNum)} short of the total.`;
  }
  if (branchId) {
    const short = Object.entries(demand).filter(([sku, need]) => (available[sku] ?? 0) + need < need || (available[sku] ?? 0) < 0);
    // available[sku] already has this cart's own demand subtracted, so a
    // negative value here means the branch doesn't have enough.
    const trulyShort = Object.entries(demand).filter(([sku]) => (available[sku] ?? 0) < 0);
    if (trulyShort.length) {
      e.stock = trulyShort.map(([sku, need]) => `${bySku[sku]?.name || sku}: this order needs ${need}, ${(available[sku] ?? 0) + need} in stock.`).join(' ');
    }
    void short;
  }
  return e;
}

// ------------------------------------------------------------ Transaction bar
function TransactionBar({
  draft,
  locked,
  receiptNo,
  branches,
  cashierName,
  fixedBranch,
  errors,
  onBranch,
}: {
  draft: Draft;
  locked: boolean;
  receiptNo: string | null;
  branches: { id: string; code: string; name: string }[];
  cashierName: string;
  fixedBranch: string | null;
  errors: Record<string, string | undefined>;
  onBranch: (id: string) => void;
}) {
  return (
    <section aria-label="Transaction" className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">Receipt no.</p>
        <p className="font-mono text-[16px] font-semibold tracking-tight text-ink">{receiptNo ?? 'Not yet assigned'}</p>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">{locked ? 'Saved' : 'Date & time'}</p>
        {locked ? (
          <p className="num text-[16px] font-bold text-ink">{fmtClock(new Date())}</p>
        ) : (
          <LiveClock
            render={(now: Date) => (
              <p className="num text-[16px] font-bold text-ink">
                {now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}, {fmtClock(now)}
              </p>
            )}
          />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">Cashier</p>
        <p className="text-[16px] font-bold text-ink">{cashierName}</p>
      </div>
      {!fixedBranch && (
        <div className="ml-auto w-full min-w-[180px] sm:w-auto">
          <label htmlFor="pos-branch" className="text-xs font-semibold text-muted">
            Branch
          </label>
          <div className="relative mt-0.5">
            <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-leaf" aria-hidden="true" />
            <Select
              id="pos-branch"
              value={draft.branchId ?? ''}
              disabled={locked}
              invalid={!!errors.branch}
              onChange={(e) => onBranch(e.target.value)}
              className="h-10 pl-9 font-semibold sm:w-56"
            >
              <option value="">Choose branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </Select>
          </div>
          {errors.branch && <p className="mt-1 text-sm font-medium text-bad">{errors.branch}</p>}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------ Customer panel
function TierPips({ n, on }: { n: number; on: boolean }) {
  return (
    <span className="flex items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: Math.min(5, n) }).map((_, i) => (
        <span key={i} className={cx('h-[5px] w-[5px] rounded-full', on ? 'bg-leaf-ink' : 'bg-leaf/70')} />
      ))}
    </span>
  );
}

function CustomerPanel({
  draft,
  locked,
  errors,
  update,
  supabase,
}: {
  draft: Draft;
  locked: boolean;
  errors: Record<string, string | undefined>;
  update: (patch: Partial<Draft>) => void;
  supabase: ReturnType<typeof createClient>;
}) {
  const { memberTiers } = useCatalog();
  const [names, setNames] = useState<{ customers: string[]; leaders: string[]; uplines: string[] }>({ customers: [], leaders: [], uplines: [] });
  const [lastVisit, setLastVisit] = useState<Sale | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchRecentNames(supabase, 'customer_name'),
      fetchRecentNames(supabase, 'leader_name'),
      fetchRecentNames(supabase, 'upline_name'),
    ]).then(([customers, leaders, uplines]) => {
      if (!cancelled) setNames({ customers, leaders, uplines });
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (locked) {
      // Not derivable from render (lastVisit only ever comes from the async
      // fetch below) — a locked/blank ticket has nothing to look up, so
      // clearing here is the reset, not a render-loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastVisit(null);
      return;
    }
    const name = draft.customerName.trim();
    if (!name) {
      setLastVisit(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      void fetchLastVisit(supabase, name).then((s) => {
        if (!cancelled) setLastVisit(s);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [draft.customerName, locked, supabase]);

  const differs =
    lastVisit &&
    (lastVisit.customerTier !== draft.customerTier ||
      (lastVisit.memberTier || '') !== (draft.customerTier === 'Member' ? draft.memberTier : '') ||
      keyOf(lastVisit.leaderName) !== keyOf(draft.leaderName) ||
      keyOf(lastVisit.uplineName) !== keyOf(draft.uplineName));

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
          <Input id="c-leader" list="dl-leaders" value={draft.leaderName} disabled={locked} autoComplete="off" placeholder="Leader" onChange={(e) => update({ leaderName: e.target.value })} />
        </Field>
        <Field label="Upline’s name" htmlFor="c-upline">
          <Input id="c-upline" list="dl-uplines" value={draft.uplineName} disabled={locked} autoComplete="off" placeholder="Upline" onChange={(e) => update({ uplineName: e.target.value })} />
        </Field>
      </div>
      <datalist id="dl-customers">
        {names.customers.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="dl-leaders">
        {names.leaders.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="dl-uplines">
        {names.uplines.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {differs && lastVisit && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-leaf-soft px-3 py-2.5 text-sm text-ink">
          <UserRoundCheck size={18} className="shrink-0 text-leaf" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            Returning customer. Last visit {fmtLongDate(lastVisit.createdAt)}: {lastVisit.customerTier}
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
            Member tier{' '}
            {isMember ? (
              <span className="text-bad" aria-hidden="true">
                *
              </span>
            ) : (
              <span className="font-normal">(members only)</span>
            )}
          </p>
          <Segmented
            ariaLabel="Member tier"
            size="sm"
            value={isMember ? draft.memberTier : ''}
            disabled={locked || !isMember}
            invalid={!!errors.memberTier}
            onChange={(v) => update({ memberTier: v })}
            options={memberTiers.map((t, i) => ({
              value: t.name,
              render: (on: boolean) => (
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
function Catalog({
  bySku,
  products,
  available,
  branchReady,
  ctx,
  draft,
  locked,
  onAdd,
}: {
  bySku: Record<string, Product>;
  products: Product[];
  available: Record<string, number>;
  branchReady: boolean;
  ctx: { customerTier: CustomerTier; memberTier: string; tiers: unknown };
  draft: Draft;
  locked: boolean;
  onAdd: (sku: string) => void;
}) {
  const { categories } = useCatalog();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const searchRef = useRef<HTMLInputElement>(null);
  const active = products.filter((p) => p.active !== false);
  const cats = categories.filter((c) => active.some((p) => p.category === c.name));
  const qk = q.trim().toLowerCase();
  const visible = active.filter((p) => (cat === 'All' || p.category === cat) && (!qk || p.name.toLowerCase().includes(qk) || p.sku.toLowerCase().includes(qk)));
  const inCart: Record<string, number> = {};
  for (const l of draft.lines) inCart[l.sku] = (inCart[l.sku] || 0) + l.qty;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !typing && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      </div>
      {!branchReady && !locked && (
        <div className="mb-3 rounded-xl border border-warn/40 bg-warn-soft px-3 py-2.5 text-sm font-semibold text-ink">Choose a branch above to see live stock and add items.</div>
      )}
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <Input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onEnter} className="pl-10" placeholder="Search name or SKU" aria-label="Search products" disabled={locked} />
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
            <ProductTile key={p.sku} p={p} bySku={bySku} available={available} branchReady={branchReady} ctx={ctx} inCart={inCart[p.sku] || 0} locked={locked} onAdd={onAdd} />
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Tip: press / to jump to search. Typing an exact SKU and pressing Enter adds it.</p>
    </section>
  );
}

function ProductTile({
  p,
  bySku,
  available,
  branchReady,
  ctx,
  inCart,
  locked,
  onAdd,
}: {
  p: Product;
  bySku: Record<string, Product>;
  available: Record<string, number>;
  branchReady: boolean;
  ctx: { customerTier: CustomerTier; memberTier: string; tiers: unknown };
  inCart: number;
  locked: boolean;
  onAdd: (sku: string) => void;
}) {
  const { retail, unit } = resolveUnitPrice(p, ctx);
  let stockLine: React.ReactNode;
  let canAdd: boolean;
  if (p.isPackage) {
    const cap = packageCapacity(p, available);
    canAdd = branchReady && cap >= 1;
    const incl = p.inclusions.map((i) => `${i.qty}× ${bySku[i.sku]?.name || i.sku}`).join(', ') || 'No stock items';
    stockLine = (
      <>
        <span className="block truncate text-xs text-muted" title={incl}>
          {incl}
        </span>
        <span className={cx('text-xs font-bold', canAdd ? 'text-muted' : 'text-bad')}>{cap === Infinity ? 'Always available' : canAdd ? `Can sell ${int(cap)}` : 'Contents out of stock'}</span>
      </>
    );
  } else {
    const left = available[p.sku] ?? 0;
    canAdd = branchReady && left >= 1;
    const st = stockStatus(left, p.reorderLevel);
    stockLine = <span className={cx('text-xs font-bold', st === 'out' ? 'text-bad' : st === 'low' ? 'text-warn' : 'text-muted')}>{st === 'out' ? 'Out of stock' : `${int(left)} left`}</span>;
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
function QtyInput({ value, onCommit, disabled, label }: { value: number; onCommit: (n: number) => void; disabled: boolean; label: string }) {
  const [text, setText] = useState(String(value));
  // Syncs the local edit buffer when `value` changes from outside (e.g. the
  // +/- steppers) — the standard "controlled input with a local draft"
  // pattern, not state derived from props during render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="num h-8 w-12 rounded-lg border border-line-strong bg-surface text-center text-[15px] font-bold text-ink focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/30 disabled:border-transparent disabled:bg-transparent"
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

interface TicketLine {
  index: number;
  sku: string;
  name: string;
  category: string;
  isPackage: boolean;
  qty: number;
  unitPrice: number;
  gross: number;
  discount: number;
  net: number;
  rule?: string;
  ruleLabel?: string;
  inclusions?: { sku: string; qty: number; name?: string }[] | null;
  unavailable?: boolean;
}

function Ticket({
  draft,
  view,
  demand,
  available,
  locked,
  saving,
  pm,
  paymentMethods,
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
}: {
  draft: Draft;
  view: { lines: TicketLine[]; gross: number; discount: number; total: number; tendered: number; change: number; isCash: boolean };
  demand: Record<string, number>;
  available: Record<string, number>;
  locked: boolean;
  saving: boolean;
  pm: { id: string; name: string; isCash: boolean } | null;
  paymentMethods: { id: string; name: string; isCash: boolean }[];
  errors: Record<string, string | undefined>;
  allErrors: Record<string, string>;
  showErrors: boolean;
  update: (patch: Partial<Draft>) => void;
  onStep: (idx: number, dir: 1 | -1) => void;
  onQty: (idx: number, n: number) => void;
  onRemove: (idx: number) => void;
  onSave: () => void;
  onPrint: () => void;
  onNew: () => void;
  canAddOne: (sku: string) => boolean;
}) {
  const { products } = useCatalog();
  const bySku = useMemo(() => indexProducts(products) as Record<string, Product>, [products]);
  const tenderRef = useRef<HTMLInputElement>(null);
  const lineShort = (l: TicketLine) => {
    const p = bySku[l.sku];
    if (locked || !p) return false;
    if (p.isPackage) return p.inclusions.some((i) => (available[i.sku] ?? 0) < 0);
    return (available[l.sku] ?? 0) < 0;
  };
  const suggestions = quickCash(view.total);
  const errorList = showErrors ? Object.values(allErrors).filter(Boolean) : [];
  void demand;

  return (
    <aside className="flex min-w-0 flex-col border-t border-line bg-surface xl:h-full xl:overflow-hidden xl:border-l xl:border-t-0" aria-label="Current order">
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
            <p className="font-bold text-ink">Sale saved</p>
            <p className="text-ink-2">Receipt {draft.saved?.receiptNo}. Print the receipt, then start a new transaction.</p>
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
                <th scope="col" className="py-2 pl-4 pr-1 sm:pl-5">
                  #
                </th>
                <th scope="col" className="px-2 py-2">
                  Product
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  Unit price
                </th>
                <th scope="col" className="px-1 py-2 text-center">
                  Qty
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  Subtotal
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  Discount
                </th>
                <th scope="col" className="py-2 pl-1 pr-3 sm:pr-4">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.lines.map((l, i) => {
                const bad = lineShort(l) || l.unavailable;
                const rule = l.rule ?? l.ruleLabel ?? '';
                const inclusions = l.inclusions ?? bySku[l.sku]?.inclusions;
                return (
                  <tr key={`${l.sku}-${i}`} className={cx('border-b border-line align-top', bad && 'bg-bad-soft')}>
                    <td className="num py-2.5 pl-4 pr-1 text-muted sm:pl-5">{i + 1}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-start gap-2">
                        <CategoryDot category={l.category} className="mt-1.5" />
                        <div className="min-w-0">
                          <p className="font-semibold leading-snug text-ink">{l.name}</p>
                          <Sku>{l.sku}</Sku>
                          {l.isPackage && inclusions && inclusions.length > 0 && (
                            <p className="text-xs text-muted">Deducts {inclusions.map((x) => `${x.qty * l.qty}× ${x.name || bySku[x.sku]?.name || x.sku}`).join(', ')}</p>
                          )}
                          {bad && <p className="text-xs font-bold text-bad">{l.unavailable ? 'No longer sold' : 'Not enough stock'}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="num whitespace-nowrap px-2 py-2.5 text-right">{amount(l.unitPrice)}</td>
                    <td className="px-1 py-2">
                      <div className="flex items-center justify-center gap-0.5">
                        {!locked && <IconButton icon={Minus} label={`One less ${l.name}`} size={28} onClick={() => onStep(i, -1)} disabled={l.qty <= 1} />}
                        <QtyInput value={l.qty} disabled={locked} label={`Quantity of ${l.name}`} onCommit={(n) => onQty(i, n)} />
                        {!locked && <IconButton icon={Plus} label={`One more ${l.name}`} size={28} onClick={() => onStep(i, 1)} disabled={!canAddOne(l.sku)} />}
                      </div>
                    </td>
                    <td className="num whitespace-nowrap px-2 py-2.5 text-right font-semibold">{amount(l.gross)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right">
                      {l.discount > 0 ? <span className="num font-semibold text-ok">−{amount(l.discount)}</span> : <span className="text-muted">—</span>}
                      {l.discount > 0 && <p className="text-[11px] leading-tight text-muted">{rule}</p>}
                    </td>
                    <td className="py-2 pl-1 pr-3 sm:pr-4">{!locked && <IconButton icon={Trash2} label={`Remove ${l.name}`} size={30} tone="danger" onClick={() => onRemove(i)} />}</td>
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
            <p className={cx('num text-lg font-bold', view.discount > 0 ? 'text-ok' : 'text-ink')}>{view.discount > 0 ? `−${peso(view.discount)}` : peso(0)}</p>
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
                value={pm?.id ?? ''}
                invalid={!!errors.paymentMethod}
                onChange={(id) => {
                  const m = paymentMethods.find((x) => x.id === id);
                  update({ paymentMethodId: id, ...(m?.isCash ? {} : { tendered: '' }) });
                  if (m?.isCash) setTimeout(() => tenderRef.current?.focus(), 30);
                }}
                options={paymentMethods.map((m) => ({ value: m.id, label: m.name, icon: payIcon(m.name) }))}
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
              <Field label="Reference no." htmlFor="ref" hint={`Optional. The ${pm?.name} transaction reference, for matching payments later.`}>
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
          <Button variant="primary" size="lg" icon={locked ? CircleCheck : Save} className="col-span-2" onClick={onSave} disabled={locked || saving}>
            {locked ? 'Saved' : saving ? 'Saving…' : 'Save sale'}
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
