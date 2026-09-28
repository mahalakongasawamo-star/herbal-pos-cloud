import React, { useEffect, useRef, useState } from 'react';
import { Database, Download, ImagePlus, Plus, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useApp } from '../lib/context';
import { createInitialData, hydrate, looksLikeData } from '../lib/seed';
import { fmtDateTime, int, isoDay, norm } from '../lib/format';
import { imageToDataUrl, readFileText, saveFile } from '../lib/platform';
import { BACKEND_LABEL, requestPersistence, storageInfo } from '../lib/storage';
import { LAYOUT_OPTIONS } from '../components/PrintCenter';
import { Button, Field, IconButton, Input, Modal, PageHeader, Panel, Pill, Segmented, Textarea, Toggle, cx, useConfirm, useToast } from '../components/ui';

const hasName = (list, name, get = (x) => x) => list.some((x) => get(x).toLowerCase() === name.toLowerCase());

export default function Options() {
  const { data, dispatch } = useApp();
  useEffect(() => {
    if (!data.settings.optionsReviewed) dispatch({ type: 'SET_SETTINGS', patch: { optionsReviewed: true } });
  }, [data.settings.optionsReviewed, dispatch]);

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <PageHeader title="Options" description="Store details, cashier stations, payment methods and member tiers. Changes save automatically." />
      <div className="grid gap-4 xl:grid-cols-2">
        <StoreSettings />
        <div className="grid content-start gap-4">
          <Cashiers />
          <PaymentMethods />
        </div>
        <MemberTiers />
        <DataBackup />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Store & receipt
function StoreSettings() {
  const { data, dispatch } = useApp();
  const toast = useToast();
  const fileRef = useRef(null);
  const s = data.settings;
  const set = (patch) => dispatch({ type: 'SET_SETTINGS', patch });

  const onLogo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      set({ logo: await imageToDataUrl(f) });
      toast({ title: 'Logo updated', message: 'It appears on every printed receipt.' });
    } catch (err) {
      toast({ tone: 'bad', title: 'Logo not added', message: err.message });
    }
  };

  return (
    <Panel title="Store and receipt" description="Shown at the top of every receipt.">
      <div className="space-y-4">
        <Field label="Company name" htmlFor="op-co">
          <Input id="op-co" value={s.companyName} onChange={(e) => set({ companyName: e.target.value })} />
        </Field>
        <Field label="Address and contact details" htmlFor="op-det" hint="One line, for example the branch address and phone number.">
          <Input id="op-det" value={s.companyDetails} onChange={(e) => set({ companyDetails: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Receipt title" htmlFor="op-title">
            <Input id="op-title" value={s.receiptTitle} onChange={(e) => set({ receiptTitle: e.target.value })} />
          </Field>
          <Field label="Footer message" htmlFor="op-foot">
            <Input id="op-foot" value={s.receiptFooter} onChange={(e) => set({ receiptFooter: e.target.value })} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink-2">Logo</p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-white">
              {s.logo ? <img src={s.logo} alt="Store logo" className="h-full w-full object-contain" /> : <span className="text-xs text-muted">None</span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogo} />
            <Button icon={ImagePlus} onClick={() => fileRef.current?.click()}>
              {s.logo ? 'Replace logo' : 'Upload logo'}
            </Button>
            {s.logo && (
              <Button variant="dangerGhost" onClick={() => set({ logo: '' })}>
                Remove
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted">PNG or JPG. It’s resized automatically to keep backups small.</p>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink-2">Print layout (A4 portrait, two copies)</p>
          <Segmented ariaLabel="Print layout" size="sm" value={s.printLayout} onChange={(v) => set({ printLayout: v })} options={LAYOUT_OPTIONS} />
          <p className="mt-1.5 text-xs text-muted">Top and bottom gives each copy a half page; side by side fits long orders on one sheet.</p>
        </div>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------ Cashiers
function Cashiers() {
  const { data, dispatch } = useApp();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const list = data.options.cashiers;
  const clean = norm(name);
  const dup = clean && hasName(list, clean);
  const add = (e) => {
    e.preventDefault();
    if (!clean || dup) return;
    dispatch({ type: 'SET_OPTIONS', patch: { cashiers: [...list, clean] } });
    setName('');
  };
  const remove = async (c) => {
    const ok = await confirm({
      title: `Remove ${c}?`,
      message: 'Past sales keep this cashier name. It just won’t be offered on new transactions.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (ok) dispatch({ type: 'SET_OPTIONS', patch: { cashiers: list.filter((x) => x !== c) } });
  };
  return (
    <Panel title="Cashier stations" description="Branch counters that record sales.">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {list.map((c) => (
          <li key={c} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="font-semibold text-ink">{c}</span>
            <IconButton icon={Trash2} label={`Remove ${c}`} tone="danger" disabled={list.length <= 1} onClick={() => remove(c)} />
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input aria-label="New cashier station" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CEBU-Cashier" invalid={!!dup} />
        <Button type="submit" icon={Plus} disabled={!clean || dup}>
          Add
        </Button>
      </form>
      {dup && <p className="mt-1 text-sm text-bad">That station already exists.</p>}
    </Panel>
  );
}

// ------------------------------------------------------------ Payment methods
function PaymentMethods() {
  const { data, dispatch } = useApp();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [isCash, setIsCash] = useState(false);
  const list = data.options.paymentMethods;
  const clean = norm(name);
  const dup = clean && hasName(list, clean, (x) => x.name);
  const setList = (paymentMethods) => dispatch({ type: 'SET_OPTIONS', patch: { paymentMethods } });
  const add = (e) => {
    e.preventDefault();
    if (!clean || dup) return;
    setList([...list, { name: clean, isCash }]);
    setName('');
    setIsCash(false);
  };
  const remove = async (m) => {
    const ok = await confirm({ title: `Remove ${m.name}?`, message: 'Past sales keep this payment method.', confirmLabel: 'Remove', tone: 'danger' });
    if (ok) setList(list.filter((x) => x.name !== m.name));
  };
  return (
    <Panel title="Payment methods" description="Methods that give change ask for cash tendered; the others ask for a reference number.">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {list.map((m) => (
          <li key={m.name} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
            <span className="font-semibold text-ink">{m.name}</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-sm text-ink-2">
                <Toggle checked={m.isCash} label={`${m.name} gives change`} onChange={(v) => setList(list.map((x) => (x.name === m.name ? { ...x, isCash: v } : x)))} />
                Gives change
              </span>
              <IconButton icon={Trash2} label={`Remove ${m.name}`} tone="danger" disabled={list.length <= 1} onClick={() => remove(m)} />
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2">
        <Input aria-label="New payment method" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maya" className="min-w-[160px] flex-1" invalid={!!dup} />
        <span className="flex items-center gap-2 text-sm text-ink-2">
          <Toggle checked={isCash} onChange={setIsCash} label="New method gives change" />
          Gives change
        </span>
        <Button type="submit" icon={Plus} disabled={!clean || dup}>
          Add
        </Button>
      </form>
      {dup && <p className="mt-1 text-sm text-bad">That method already exists.</p>}
    </Panel>
  );
}

// ------------------------------------------------------------ Member tiers
function PctInput({ value, onCommit, label }) {
  const [text, setText] = useState(String(value ?? 0));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value ?? 0));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const n = text === '' ? 0 : Number(text);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setText(String(value ?? 0));
      return;
    }
    if (n !== Number(value)) onCommit(Math.round(n * 100) / 100);
  };
  return (
    <div className="relative w-28">
      <input
        aria-label={label}
        inputMode="decimal"
        className="num h-10 w-full rounded-lg border border-line-strong bg-surface pl-3 pr-8 text-right font-bold text-ink focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/30"
        value={text}
        onFocus={(e) => {
          setEditing(true);
          e.target.select();
        }}
        onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-semibold text-muted">%</span>
    </div>
  );
}

function MemberTiers() {
  const { data, dispatch } = useApp();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const list = data.options.memberTiers;
  const clean = norm(name);
  const dup = clean && hasName(list, clean, (x) => x.name);
  const setList = (memberTiers) => dispatch({ type: 'SET_OPTIONS', patch: { memberTiers } });
  const add = (e) => {
    e.preventDefault();
    if (!clean || dup) return;
    setList([...list, { name: clean, discountPct: 0 }]);
    setName('');
  };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  const remove = async (t) => {
    const ok = await confirm({
      title: `Remove the ${t.name} tier?`,
      message: 'Past sales keep this tier name. Tier prices set for it on products stop being used.',
      confirmLabel: 'Remove tier',
      tone: 'danger',
    });
    if (ok) setList(list.filter((x) => x.name !== t.name));
  };
  return (
    <Panel title="Member tiers and discounts" description="Lowest rank first. The discount % applies to products that have no member or tier price.">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {list.map((t, i) => (
          <li key={t.name} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="flex w-5 flex-col items-center" aria-hidden="true">
              <span className="num text-xs font-bold text-muted">{i + 1}</span>
            </span>
            <span className="min-w-[120px] flex-1 font-semibold text-ink">{t.name}</span>
            <span className="flex items-center gap-2 text-sm text-ink-2">
              Discount
              <PctInput label={`${t.name} discount percent`} value={t.discountPct} onCommit={(v) => setList(list.map((x) => (x.name === t.name ? { ...x, discountPct: v } : x)))} />
            </span>
            <span className="flex items-center">
              <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${t.name} up`}>
                Up
              </Button>
              <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={`Move ${t.name} down`}>
                Down
              </Button>
              <IconButton icon={Trash2} label={`Remove ${t.name}`} tone="danger" disabled={list.length <= 1} onClick={() => remove(t)} />
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input aria-label="New member tier" value={name} onChange={(e) => setName(e.target.value)} placeholder="New tier name" invalid={!!dup} />
        <Button type="submit" icon={Plus} disabled={!clean || dup}>
          Add tier
        </Button>
      </form>
      {dup && <p className="mt-1 text-sm text-bad">That tier already exists.</p>}
    </Panel>
  );
}

// ------------------------------------------------------------ Data & backup
function DataBackup() {
  const { data, replaceData, saveState } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef(null);
  const [info, setInfo] = useState(null);
  const [manual, setManual] = useState(null);

  useEffect(() => {
    let live = true;
    storageInfo().then((i) => live && setInfo(i));
    return () => {
      live = false;
    };
  }, [saveState?.at]);

  const exportBackup = async () => {
    const payload = JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 1);
    const name = `pos-backup-${isoDay()}.json`;
    const r = await saveFile(name, payload, 'application/json');
    if (r.ok) toast({ title: 'Backup saved', message: `${name}. Keep it somewhere other than this device.` });
    else if (!r.declined) setManual(payload);
  };

  const importBackup = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    let raw;
    try {
      raw = JSON.parse(await readFileText(f));
    } catch {
      toast({ tone: 'bad', title: 'Not a backup file', message: 'That file isn’t valid JSON.' });
      return;
    }
    if (!looksLikeData(raw)) {
      toast({ tone: 'bad', title: 'Not a POS backup', message: 'The file doesn’t contain products and sales from this app.' });
      return;
    }
    const ok = await confirm({
      title: 'Replace all data with this backup?',
      message: (
        <div className="space-y-2">
          <p>
            Backup {raw.exportedAt ? `from ${fmtDateTime(raw.exportedAt)}` : ''}: {int(raw.products.length)} products, {int(raw.sales.length)} sales,{' '}
            {int((raw.stockIns || []).length)} stock entries.
          </p>
          <p>Everything currently on this device is replaced. Export a backup first if you might need it.</p>
        </div>
      ),
      confirmLabel: 'Replace data',
      tone: 'danger',
    });
    if (!ok) return;
    replaceData(hydrate(raw));
    toast({ title: 'Backup restored', message: `${int(raw.sales.length)} sales loaded.` });
  };

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset all data?',
      message: 'This deletes every sale, stock entry, price and setting on this device and restores the starting catalog. It can’t be undone.',
      confirmLabel: 'Delete everything',
      tone: 'danger',
      typeToConfirm: 'reset',
    });
    if (!ok) return;
    replaceData(createInitialData());
    toast({ tone: 'warn', title: 'Data reset', message: 'The starting catalog was restored.' });
  };

  const persist = async () => {
    const ok = await requestPersistence();
    setInfo(await storageInfo());
    toast({ tone: ok ? 'ok' : 'warn', title: ok ? 'Storage protected' : 'Browser declined', message: ok ? 'The browser won’t clear this data to free up space.' : 'Keep regular backups instead.' });
  };

  const mb = (b) => (b == null ? '—' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

  return (
    <Panel title="Data and backup" description="Records are stored in this browser on this device. Other devices keep their own records.">
      <dl className="grid gap-3 rounded-xl bg-sunken p-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Saved in</dt>
          <dd className={cx('font-semibold', info?.backend === 'memory' ? 'text-bad' : 'text-ink')}>{BACKEND_LABEL[info?.backend] || 'Checking…'}</dd>
        </div>
        <div>
          <dt className="text-muted">Last saved</dt>
          <dd className="font-semibold text-ink">{saveState?.at ? fmtDateTime(saveState.at) : 'No changes yet'}</dd>
        </div>
        <div>
          <dt className="text-muted">Records</dt>
          <dd className="font-semibold text-ink">
            {int(data.products.length)} products, {int(data.sales.length)} sales, {int(data.stockIns.length)} stock entries
          </dd>
        </div>
        <div>
          <dt className="text-muted">Space used</dt>
          <dd className="font-semibold text-ink">
            {mb(info?.usage)}
            {info?.persisted ? (
              <Pill tone="ok" className="ml-2">
                Protected
              </Pill>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="leaf" icon={Download} onClick={exportBackup}>
          Export backup
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importBackup} />
        <Button icon={Upload} onClick={() => fileRef.current?.click()}>
          Import backup
        </Button>
        {!info?.persisted && (
          <Button variant="ghost" icon={ShieldCheck} onClick={persist}>
            Protect storage
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">Export a backup at the end of each business day. Browsers can clear site data, and a backup is your only copy elsewhere.</p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/30 p-3">
        <div className="min-w-0">
          <p className="font-bold text-ink">Reset all data</p>
          <p className="text-sm text-muted">Deletes sales, stock and settings on this device.</p>
        </div>
        <Button variant="dangerGhost" icon={RotateCcw} onClick={reset}>
          Reset
        </Button>
      </div>

      <Modal
        open={!!manual}
        onClose={() => setManual(null)}
        title="Copy your backup"
        description="Saving files isn’t available here. Copy this text into a file named pos-backup.json."
        size="lg"
        footer={
          <Button
            variant="leaf"
            icon={Database}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(manual);
                toast({ title: 'Backup copied', message: 'Paste it into a text file and save it.' });
              } catch {
                toast({ tone: 'warn', title: 'Copy blocked', message: 'Select the text and copy it manually.' });
              }
            }}
          >
            Copy to clipboard
          </Button>
        }
      >
        <Textarea readOnly value={manual || ''} className="h-72 font-mono text-xs" onFocus={(e) => e.target.select()} />
      </Modal>
    </Panel>
  );
}
