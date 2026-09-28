'use client';

// Ported from legacy-vite-app/src/modules/AddStock.jsx's StockHistory (SPEC
// §10), adapted to server pagination (fetchStockIns) instead of slicing an
// in-memory array, and to a batch-per-row shape (a stock_ins header can
// cover several product lines) instead of legacy's one-ledger-row-per-entry
// table.
//
// Decisions, documented per the task brief:
//   - Undo: try-and-catch. reverseStockIn is called directly; a
//     'would_go_negative' failure is caught and toasted rather than
//     pre-computed client-side (the RPC is the source of truth for whether
//     any of the batch has already been sold).
//   - Product list per batch: fetched lazily via fetchStockInLines the
//     first time a row is expanded, then cached, so history — most likely to
//     be single-line batches — doesn't pay for every line up front.
import { Fragment, useEffect, useState } from 'react';
import { History, ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchStockInLines, fetchStockIns, type StockInsPage } from '@/lib/data/stock-ins';
import { reverseStockIn } from '@/lib/rpc/reverse-stock-in';
import { RpcError } from '@/lib/rpc/errors';
import { fmtDate, fmtDateTimeShort, int, parseDay } from '@/lib/format';
import { Button, cx, EmptyState, IconButton, Panel, Pill, Sku, useConfirm, useToast } from '@/components/ui';
import type { StockIn, StockLedgerEntry } from '@/lib/types';

const PAGE_SIZE = 30;

type Lines = (StockLedgerEntry & { productName: string; productSku: string })[];

function omit<T extends Record<string, unknown>>(obj: T, key: string): T {
  const next = { ...obj };
  delete next[key];
  return next;
}

export function StockHistory({
  supabase,
  branchId,
  refreshKey,
}: {
  supabase: SupabaseClient;
  branchId: string | null;
  refreshKey: number;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [rows, setRows] = useState<StockIn[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, Lines | 'loading'>>({});
  const [undoing, setUndoing] = useState<string | null>(null);

  // `loading` isn't set true here on purpose — it starts true (above) for
  // the first paint, and every later call is fast enough that the old rows
  // staying on screen until the new ones arrive reads better than a flash.
  // It still gates the "Show more" button so a second click can't race.
  const load = async (nextPage: number, append: boolean) => {
    try {
      const result: StockInsPage = await fetchStockIns(supabase, { branchId: branchId ?? undefined, page: nextPage, pageSize: PAGE_SIZE });
      setRows((prev) => (append ? [...prev, ...result.stockIns] : result.stockIns));
      setTotal(result.total);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load's identity changes every render; only branchId/refreshKey should retrigger the fetch.
  }, [branchId, refreshKey]);

  const toggle = async (id: string) => {
    setExpanded((e) => (e[id] ? omit(e, id) : { ...e, [id]: 'loading' }));
    if (expanded[id]) return;
    const lines = await fetchStockInLines(supabase, id);
    setExpanded((e) => (e[id] === undefined ? e : { ...e, [id]: lines }));
  };

  const undo = async (row: StockIn) => {
    const ok = await confirm({
      title: 'Undo this stock entry?',
      message: 'This removes the items from stock. The entry stays in the history, marked undone.',
      confirmLabel: 'Undo entry',
      tone: 'danger',
    });
    if (!ok) return;
    setUndoing(row.id);
    try {
      await reverseStockIn(supabase, row.id);
      toast({ title: 'Stock entry undone', message: 'Stock was adjusted back down.' });
      void load(0, false);
      setExpanded((e) => omit(e, row.id));
    } catch (err) {
      if (err instanceof RpcError && err.hint === 'would_go_negative') {
        toast({ tone: 'bad', title: "Can't undo", message: "Some of this stock was already sold." });
      } else if (err instanceof RpcError && err.hint === 'already_reversed') {
        toast({ tone: 'bad', title: "Can't undo", message: 'This entry was already undone.' });
        void load(0, false);
      } else {
        const message = err instanceof RpcError ? err.message : 'Check the connection and try again.';
        toast({ tone: 'bad', title: "Can't undo", message });
      }
    } finally {
      setUndoing(null);
    }
  };

  return (
    <Panel title="Recent stock entries" className="mt-4" bodyClassName="pt-3">
      {!loading && rows.length === 0 ? (
        <EmptyState icon={History} title="No stock entries yet" className="border-t border-line">
          Received stock appears here. Undo an entry if it was keyed in by mistake.
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-sunken text-left text-xs font-semibold text-muted">
                  <th scope="col" className="w-8 px-2 py-2.5" />
                  <th scope="col" className="px-3 py-2.5 sm:px-5">
                    Date received
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Product(s)
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Recorded
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right sm:px-5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const lines = expanded[row.id];
                  const isOpen = lines !== undefined;
                  return (
                    <Fragment key={row.id}>
                      <tr className={cx('border-t border-line', row.reversed && 'text-muted')}>
                        <td className="px-2 py-2">
                          <IconButton
                            icon={isOpen ? ChevronDown : ChevronRight}
                            label={isOpen ? 'Hide products' : 'Show products'}
                            size={28}
                            onClick={() => void toggle(row.id)}
                          />
                        </td>
                        <td className="num whitespace-nowrap px-3 py-2 sm:px-5">{fmtDate(parseDay(row.date))}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => void toggle(row.id)}
                            className={cx('text-left font-semibold underline decoration-dotted underline-offset-2', row.reversed ? 'text-muted line-through' : 'text-ink hover:text-leaf')}
                          >
                            {isOpen ? 'Hide items' : 'Show items'}
                          </button>
                          {row.note && <p className="mt-0.5 max-w-[260px] truncate text-xs text-muted" title={row.note}>{row.note}</p>}
                        </td>
                        <td className="num whitespace-nowrap px-3 py-2 text-muted">
                          {fmtDateTimeShort(row.createdAt)}
                          {row.createdByName ? ` · ${row.createdByName}` : ''}
                        </td>
                        <td className="whitespace-nowrap px-4 py-1.5 text-right sm:px-5">
                          {row.reversed ? (
                            <Pill>Undone</Pill>
                          ) : (
                            <Button size="sm" variant="ghost" icon={Undo2} disabled={undoing === row.id} onClick={() => void undo(row)}>
                              {undoing === row.id ? 'Undoing…' : 'Undo'}
                            </Button>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-line bg-sunken/40">
                          <td />
                          <td colSpan={4} className="px-3 py-2 sm:px-5">
                            {lines === 'loading' ? (
                              <p className="text-sm text-muted">Loading…</p>
                            ) : lines.length === 0 ? (
                              <p className="text-sm text-muted">No lines found.</p>
                            ) : (
                              <ul className="space-y-1">
                                {lines.map((l) => (
                                  <li key={l.id} className="flex items-center gap-2 text-sm">
                                    <span className="num font-bold text-ok">+{int(l.delta)}</span>
                                    <span className="font-medium text-ink">{l.productName || l.productSku}</span>
                                    <Sku>{l.productSku}</Sku>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length < total && (
            <div className="border-t border-line px-4 py-3 text-center sm:px-5">
              <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load(page + 1, true)}>
                {loading ? 'Loading…' : `Show more (${int(total - rows.length)} older)`}
              </Button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
