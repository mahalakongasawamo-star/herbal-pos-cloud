// Add Stock's receiving history (server-paginated).
import type { SupabaseClient } from '@supabase/supabase-js';
import { toStockIn } from '@/lib/mappers';
import type { StockIn, StockLedgerEntry } from '@/lib/types';
import { toStockLedgerEntry } from '@/lib/mappers';

interface StockInQueryRow {
  [key: string]: unknown;
  created_by_profile: { full_name: string } | { full_name: string }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export interface StockInsFilter {
  branchId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface StockInsPage {
  stockIns: StockIn[];
  total: number;
}

export async function fetchStockIns(supabase: SupabaseClient, filter: StockInsFilter = {}): Promise<StockInsPage> {
  const page = filter.page ?? 0;
  const pageSize = filter.pageSize ?? 50;
  let q = supabase
    .from('stock_ins')
    .select('*, created_by_profile:profiles!stock_ins_created_by_fkey(full_name)', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (filter.branchId) q = q.eq('branch_id', filter.branchId);
  if (filter.from) q = q.gte('date', filter.from);
  if (filter.to) q = q.lte('date', filter.to);
  q = q.range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw error;
  const rows = data as unknown as StockInQueryRow[];
  return {
    stockIns: rows.map((r) => toStockIn(r as never, one(r.created_by_profile)?.full_name ?? null)),
    total: count ?? 0,
  };
}

/** The 'receive' ledger rows for one batch — what it actually put on the
 * shelf, per product (Add Stock's expandable row / receipt-like summary). */
export async function fetchStockInLines(
  supabase: SupabaseClient,
  stockInId: string,
): Promise<(StockLedgerEntry & { productName: string; productSku: string })[]> {
  const { data, error } = await supabase
    .from('stock_ledger')
    .select('*, product:products(sku, name)')
    .eq('ref_stock_in_id', stockInId)
    .eq('reason', 'receive')
    .order('created_at');
  if (error) throw error;
  return (data as unknown as { product: { sku: string; name: string } | { sku: string; name: string }[] | null; [k: string]: unknown }[]).map(
    (r) => {
      const p = one(r.product);
      return { ...toStockLedgerEntry(r as never), productSku: p?.sku ?? '', productName: p?.name ?? '' };
    },
  );
}
