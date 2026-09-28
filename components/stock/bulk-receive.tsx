'use client';

// Ported from legacy-vite-app/src/modules/AddStock.jsx's BulkReceive (SPEC
// §10). Deviation: `note` is passed as the stock_ins batch note (see
// receive-form.tsx's header comment for why), not attached per line.
import { useMemo, useState } from 'react';
import { PackagePlus } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useCatalog } from '@/components/providers/catalog-provider';
import { useLiveStock } from '@/lib/hooks/use-live-stock';
import { int, isoDay, norm } from '@/lib/format';
import { Button, CategoryDot, cx, Field, Input, Panel, Sku, useToast } from '@/components/ui';
import { receiveStock } from '@/lib/rpc/receive-stock';
import { RpcError } from '@/lib/rpc/errors';

export function BulkReceive({ supabase, branchId, onReceived }: { supabase: SupabaseClient; branchId: string | null; onReceived: () => void }) {
  const { products, categories } = useCatalog();
  const stock = useLiveStock();
  const toast = useToast();
  const [date, setDate] = useState(isoDay());
  const [note, setNote] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [fill, setFill] = useState('');
  const [saving, setSaving] = useState(false);

  const catIndex = useMemo(() => Object.fromEntries(categories.map((c, i) => [c.name, i])), [categories]);
  const rows = useMemo(
    () =>
      products
        .filter((p) => !p.isPackage && p.active !== false)
        .sort((a, b) => (catIndex[a.category] ?? 99) - (catIndex[b.category] ?? 99) || a.name.localeCompare(b.name)),
    [products, catIndex],
  );
  const entries = Object.entries(qtys)
    .map(([sku, v]) => ({ sku, qty: parseInt(v, 10) }))
    .filter((e) => e.qty > 0);
  const units = entries.reduce((a, e) => a + e.qty, 0);

  const submit = async () => {
    if (!entries.length || !date || !branchId || saving) return;
    setSaving(true);
    try {
      await receiveStock(supabase, {
        branchId,
        entries: entries.map((e) => ({ sku: e.sku, qty: e.qty })),
        stockDate: date,
        note: norm(note),
      });
      toast({ title: `Received ${int(units)} units`, message: `${int(entries.length)} products updated.` });
      onReceived();
      setQtys({});
      setNote('');
    } catch (err) {
      const message = err instanceof RpcError ? err.message : 'Check the connection and try again — nothing was lost.';
      toast({ tone: 'bad', title: 'Stock not received', message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Bulk receive" description="Enter quantities for many items at once. Useful for the first stock count or a large delivery." bodyClassName="pt-3">
      <div className="grid gap-4 px-4 pb-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:px-5">
        <Field label="Date received" htmlFor="bk-date" required>
          <Input id="bk-date" type="date" value={date} max={isoDay()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="bk-note" hint="Optional. Applied to this whole batch.">
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
              <th scope="col" className="px-4 py-2.5 sm:px-5">
                Product
              </th>
              <th scope="col" className="px-3 py-2.5">
                SKU
              </th>
              <th scope="col" className="px-3 py-2.5 text-right">
                On hand
              </th>
              <th scope="col" className="px-3 py-2.5 text-right">
                Qty in
              </th>
              <th scope="col" className="px-4 py-2.5 text-right sm:px-5">
                After
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const cur = branchId ? stock.onHand(branchId, p.id) : 0;
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
          <Button variant="leaf" icon={PackagePlus} onClick={submit} disabled={!entries.length || !date || !branchId || saving}>
            {saving ? 'Receiving…' : `Receive ${entries.length ? int(units) : ''} units`}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
