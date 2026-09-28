import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  BookOpen,
  Boxes,
  ChartColumn,
  CircleAlert,
  CircleCheck,
  Leaf,
  MonitorSmartphone,
  PackagePlus,
  ScrollText,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
} from 'lucide-react';
import { AppCtx } from './lib/context';
import { reducer } from './lib/reducer';
import { DEFAULT_COMPANY, hydrate } from './lib/seed';
import { onHand, stockStatus } from './lib/pricing';
import { DRAFT_KEY, PREFS_KEY, getBackend, loadData, lsGet, lsSet, saveData } from './lib/storage';
import { useTabLock } from './lib/tablock';
import { getDownloads, tryPrint } from './lib/platform';
import { isDraft, newDraft } from './lib/draft';
import { fmtClock } from './lib/format';
import { Button, Drawer, cx } from './components/ui';
import { PRINT_PAGE_CSS, RECEIPT_CSS } from './components/Receipt';
import { PrintRoot, ReceiptModal } from './components/PrintCenter';
import PosModule from './modules/PosModule';
import SalesLog from './modules/SalesLog';
import Inventory from './modules/Inventory';
import AddStock from './modules/AddStock';
import Reports from './modules/Reports';
import ProductMaster from './modules/ProductMaster';
import Options from './modules/Options';
import { SetupGuide } from './modules/SetupGuide';

const NAV = [
  { id: 'pos', label: 'POS', title: 'Point of sale', icon: ShoppingCart, el: PosModule },
  { id: 'sales', label: 'Sales log', title: 'Sales log', icon: ScrollText, el: SalesLog },
  { id: 'inventory', label: 'Inventory', title: 'Inventory', icon: Boxes, el: Inventory },
  { id: 'stock', label: 'Add stock', title: 'Add stock', icon: PackagePlus, el: AddStock },
  { id: 'reports', label: 'Reports', title: 'Reports', icon: ChartColumn, el: Reports },
  { id: 'products', label: 'Product master', title: 'Product master', icon: Tags, el: ProductMaster },
  { id: 'options', label: 'Options', title: 'Options', icon: SlidersHorizontal, el: Options },
];

const defaultPayment = (d) => d.options.paymentMethods.find((p) => p.isCash)?.name || d.options.paymentMethods[0]?.name || '';
const prefCashier = (d) => {
  const c = lsGet(PREFS_KEY, {}).cashier;
  return d.options.cashiers.includes(c) ? c : '';
};

export default function App() {
  const [data, dispatch] = useReducer(reducer, null);
  const [phase, setPhase] = useState('loading');
  const [saveState, setSaveState] = useState({ status: 'idle', at: null, backend: null });
  const [tab, setTab] = useState(() => {
    const t = lsGet(PREFS_KEY, {}).tab;
    return NAV.some((n) => n.id === t) ? t : 'pos';
  });
  const [draft, setDraft] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [receiptView, setReceiptView] = useState(null);
  const [printJob, setPrintJob] = useState(null);
  const mainRef = useRef(null);

  // ---- persistence: one snapshot, debounced, written in order
  const lastSaved = useRef(null);
  const pending = useRef(null);
  const timer = useRef(null);
  const chain = useRef(Promise.resolve());

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const snapshot = pending.current;
    if (!snapshot) return chain.current;
    pending.current = null;
    const run = chain.current.then(async () => {
      const ok = await saveData(snapshot);
      if (ok) lastSaved.current = snapshot;
      setSaveState((s) => ({ status: ok ? 'saved' : 'error', at: ok ? new Date() : s.at, backend: getBackend() }));
    });
    chain.current = run.catch(() => {});
    return chain.current;
  }, []);

  const acquire = useCallback(async () => {
    setPhase('loading');
    const raw = await loadData();
    const d = hydrate(raw);
    lastSaved.current = raw ? d : null; // first run: write the seed catalog once
    dispatch({ type: 'REPLACE', data: d });
    const saved = lsGet(DRAFT_KEY, null);
    let dr = isDraft(saved) ? saved : null;
    if (dr && !dr.savedAt && d.sales.some((s) => s.receiptNo === dr.receiptNo)) dr = null;
    if (dr && dr.savedAt && !d.sales.some((s) => s.receiptNo === dr.receiptNo)) dr = null;
    setDraft(dr ? { ...newDraft(d.seq + 1), ...dr } : newDraft(d.seq + 1, prefCashier(d), defaultPayment(d)));
    setSaveState((s) => ({ ...s, backend: getBackend() }));
    setPhase('ready');
  }, []);

  const lock = useTabLock({ onAcquire: acquire, onRelease: flush });
  const active = lock.state === 'active';

  useEffect(() => {
    if (phase !== 'ready' || !data || !active) return;
    if (data === lastSaved.current) return;
    pending.current = data;
    setSaveState((s) => ({ ...s, status: 'saving' }));
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 250);
  }, [data, phase, active, flush]);

  useEffect(() => {
    const onVis = () => document.visibilityState === 'hidden' && flush();
    const onUnload = (e) => {
      if (pending.current) {
        flush();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [flush]);

  useEffect(() => {
    if (draft && active) lsSet(DRAFT_KEY, draft);
  }, [draft, active]);

  useEffect(() => {
    lsSet(PREFS_KEY, { ...lsGet(PREFS_KEY, {}), tab });
    mainRef.current?.scrollTo?.(0, 0);
  }, [tab]);

  useEffect(() => {
    getDownloads(); // warm up the platform handshake so the first export is instant
  }, []);

  // First run: open the setup guide once.
  useEffect(() => {
    if (phase !== 'ready' || !data) return;
    const prefs = lsGet(PREFS_KEY, {});
    if (!prefs.guideSeen && data.sales.length === 0) {
      setGuideOpen(true);
      lsSet(PREFS_KEY, { ...prefs, guideSeen: true });
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const company = data?.settings.companyName;
  useEffect(() => {
    if (company !== undefined) document.title = company && company !== DEFAULT_COMPANY ? `${company} POS` : 'POS and inventory';
  }, [company]);

  // ---- printing
  const printSale = useCallback((sale) => setPrintJob({ sale, n: Date.now() }), []);
  useEffect(() => {
    if (!printJob) return undefined;
    let cancelled = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(async () => {
        if (cancelled) return;
        const ok = await tryPrint();
        if (!ok && !cancelled) setReceiptView({ receiptNo: printJob.sale.receiptNo, notice: 'blocked' });
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [printJob]);

  const replaceData = useCallback((d) => {
    dispatch({ type: 'REPLACE', data: d });
    setDraft(newDraft(d.seq + 1, prefCashier(d), defaultPayment(d)));
    setReceiptView(null);
    setPrintJob(null);
  }, []);

  const go = useCallback((id) => setTab(id), []);
  const openGuide = useCallback(() => setGuideOpen(true), []);
  const viewReceipt = useCallback((receiptNo) => setReceiptView({ receiptNo }), []);

  const lowCount = useMemo(() => {
    if (!data) return 0;
    return data.products.filter((p) => !p.isPackage && p.active !== false && stockStatus(onHand(data.stock[p.sku]), p.reorderLevel) !== 'in').length;
  }, [data]);

  if (lock.state === 'blocked' || lock.state === 'released') return <LockScreen state={lock.state} onTakeOver={lock.takeOver} />;
  if (phase !== 'ready' || !data || !draft) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-muted">
        <p className="animate-pulse text-[15px] font-semibold">Opening the register…</p>
      </div>
    );
  }

  const current = NAV.find((n) => n.id === tab) || NAV[0];
  const Module = current.el;
  const ctx = { data, dispatch, draft, setDraft, go, openGuide, printSale, viewReceipt, replaceData, saveState };

  return (
    <AppCtx.Provider value={ctx}>
      <style>{RECEIPT_CSS + PRINT_PAGE_CSS}</style>
      <div className="flex h-full">
        <Rail tab={tab} go={go} lowCount={lowCount} onGuide={openGuide} logo={data.settings.logo} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
            <div className="md:hidden">
              <BrandMark logo={data.settings.logo} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-extrabold leading-tight text-ink">{data.settings.companyName || 'Your company'}</p>
              <p className="truncate text-xs text-muted">{current.title}</p>
            </div>
            <SaveIndicator state={saveState} onClick={() => go('options')} />
            <Button size="sm" variant="ghost" icon={BookOpen} className="md:hidden" onClick={openGuide} aria-label="Setup guide">
              Guide
            </Button>
          </header>
          <nav aria-label="Main" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-2 md:hidden">
            {NAV.map((n) => {
              const on = n.id === tab;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => go(n.id)}
                  aria-current={on ? 'page' : undefined}
                  className={cx(
                    'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf',
                    on ? 'bg-leaf text-leaf-ink' : 'text-ink-2 hover:bg-sunken',
                  )}
                >
                  <n.icon size={16} aria-hidden="true" />
                  {n.label}
                  {n.id === 'inventory' && lowCount > 0 && <span className="num rounded-full bg-warn px-1.5 text-[11px] font-bold text-surface">{lowCount}</span>}
                </button>
              );
            })}
          </nav>
          <main ref={mainRef} id="main" className="min-h-0 flex-1 overflow-y-auto">
            <Module />
          </main>
        </div>
      </div>
      <PrintRoot job={printJob} settings={data.settings} />
      {receiptView && <ReceiptModal view={receiptView} onClose={() => setReceiptView(null)} />}
      <Drawer open={guideOpen} onClose={() => setGuideOpen(false)} title="Setup guide">
        <SetupGuide onClose={() => setGuideOpen(false)} />
      </Drawer>
    </AppCtx.Provider>
  );
}

function BrandMark({ logo }) {
  return logo ? (
    <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
      <img src={logo} alt="" className="h-full w-full object-contain" />
    </span>
  ) : (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-turmeric text-turmeric-ink" aria-hidden="true">
      <Leaf size={22} strokeWidth={2.4} />
    </span>
  );
}

function Rail({ tab, go, lowCount, onGuide, logo }) {
  return (
    <nav aria-label="Main" className="hidden w-[92px] shrink-0 flex-col bg-rail text-rail-ink md:flex">
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-white/10">
        <BrandMark logo={logo} />
      </div>
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
        {NAV.map((n) => {
          const on = n.id === tab;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => go(n.id)}
                aria-current={on ? 'page' : undefined}
                className={cx(
                  'relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11.5px] font-semibold leading-tight transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-turmeric',
                  on ? 'bg-turmeric text-turmeric-ink' : 'text-rail-ink hover:bg-white/10',
                )}
              >
                <n.icon size={21} aria-hidden="true" strokeWidth={on ? 2.4 : 2} />
                <span className="text-center">{n.label}</span>
                {n.id === 'inventory' && lowCount > 0 && (
                  <span className="num absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-warn px-1 text-center text-[10.5px] font-bold leading-[18px] text-white" aria-label={`${lowCount} low or out of stock`}>
                    {lowCount}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="shrink-0 border-t border-white/10 p-2">
        <button
          type="button"
          onClick={onGuide}
          className="flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11.5px] font-semibold leading-tight text-rail-muted hover:bg-white/10 hover:text-rail-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-turmeric"
        >
          <BookOpen size={20} aria-hidden="true" />
          Setup guide
        </button>
      </div>
    </nav>
  );
}

function SaveIndicator({ state, onClick }) {
  const blocked = state.backend === 'memory';
  const failed = blocked || state.status === 'error';
  const label = blocked ? 'Not saving' : state.status === 'saving' ? 'Saving…' : failed ? 'Save failed' : 'Saved';
  const title = blocked
    ? 'This browser is blocking storage, so nothing is being kept. Open Options for details.'
    : state.at
      ? `Saved on this device at ${fmtClock(state.at)}`
      : 'Saved on this device';
  const Icon = failed ? CircleAlert : CircleCheck;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf',
        failed ? 'bg-bad-soft text-bad' : state.status === 'saving' ? 'bg-sunken text-ink-2' : 'bg-ok-soft text-ok',
      )}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
      <span className="sr-only">. {title}</span>
    </button>
  );
}

function LockScreen({ state, onTakeOver }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
        <MonitorSmartphone size={30} className="mx-auto text-leaf" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-extrabold text-ink">{state === 'released' ? 'The POS moved to another tab' : 'The POS is open in another tab'}</h1>
        <p className="mt-2 text-[15px] text-muted">
          Only one tab runs the register at a time, so sales and stock can’t overwrite each other.
          {state === 'released' ? ' Everything from this tab was saved first.' : ''}
        </p>
        <Button
          variant="leaf"
          className="mt-5"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onTakeOver();
            setBusy(false);
          }}
        >
          {busy ? 'Switching…' : 'Use the POS here'}
        </Button>
      </div>
    </div>
  );
}
