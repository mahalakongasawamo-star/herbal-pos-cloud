// Sales log + receipt reads. Server-paginated and filtered (not "load
// everything into memory," which is what the legacy app could get away
// with on a browser-local dataset but a shared, growing cloud one can't).
import type { SupabaseClient } from '@supabase/supabase-js';
import { toSale } from '@/lib/mappers';
import type { Sale } from '@/lib/types';

interface SaleQueryRow {
  [key: string]: unknown;
  cashier: { full_name: string } | { full_name: string }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const SALE_COLUMNS = '*, cashier:profiles!sales_cashier_id_fkey(full_name)';

export interface SalesFilter {
  /** ISO date (yyyy-mm-dd), inclusive, Asia/Manila calendar day. */
  from?: string;
  to?: string;
  cashierId?: string;
  branchId?: string;
  /** Matches receipt no., customer, leader or upline name (case-insensitive). */
  search?: string;
  /** 'all' (default) | 'completed' | 'void'. */
  status?: 'all' | 'completed' | 'void';
  page?: number;
  pageSize?: number;
}

export interface SalesPage {
  sales: Sale[];
  total: number;
}

export async function fetchSales(supabase: SupabaseClient, filter: SalesFilter = {}): Promise<SalesPage> {
  const page = filter.page ?? 0;
  const pageSize = filter.pageSize ?? 50;
  let q = supabase.from('sales').select(SALE_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false });

  if (filter.from) q = q.gte('created_at', `${filter.from}T00:00:00+08:00`);
  if (filter.to) q = q.lt('created_at', nextDay(filter.to) + 'T00:00:00+08:00');
  if (filter.cashierId) q = q.eq('cashier_id', filter.cashierId);
  if (filter.branchId) q = q.eq('branch_id', filter.branchId);
  if (filter.status && filter.status !== 'all') q = q.eq('status', filter.status);
  if (filter.search) {
    const s = filter.search.replace(/[%_]/g, (m) => `\\${m}`);
    q = q.or(`receipt_no.ilike.%${s}%,customer_name.ilike.%${s}%,leader_name.ilike.%${s}%,upline_name.ilike.%${s}%`);
  }
  q = q.range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw error;
  const rows = data as unknown as SaleQueryRow[];
  return {
    sales: rows.map((r) => toSale(r as never, one(r.cashier)?.full_name ?? null)),
    total: count ?? 0,
  };
}

export async function fetchSaleWithItems(supabase: SupabaseClient, saleId: string): Promise<Sale | null> {
  const { data, error } = await supabase
    .from('sales')
    .select(`${SALE_COLUMNS}, sale_items(*)`)
    .eq('id', saleId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as SaleQueryRow & { sale_items: unknown[] };
  return toSale(row as never, one(row.cashier)?.full_name ?? null, row.sale_items as never[]);
}

export async function fetchSaleByReceiptNo(supabase: SupabaseClient, receiptNo: string): Promise<Sale | null> {
  const { data, error } = await supabase
    .from('sales')
    .select(`${SALE_COLUMNS}, sale_items(*)`)
    .eq('receipt_no', receiptNo)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as SaleQueryRow & { sale_items: unknown[] };
  return toSale(row as never, one(row.cashier)?.full_name ?? null, row.sale_items as never[]);
}

/** Distinct, most-recent-first customer/leader/upline names for autocomplete
 * (POS CustomerPanel's datalists) — capped, not "every sale ever." */
export async function fetchRecentNames(
  supabase: SupabaseClient,
  field: 'customer_name' | 'leader_name' | 'upline_name',
  limit = 300,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('sales')
    .select(field)
    .neq(field, '')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of data as unknown as Record<string, string>[]) {
    const v = row[field];
    const k = v.toLowerCase();
    if (v && !seen.has(k)) {
      seen.add(k);
      out.push(v);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** The caller's most recent non-void sale for this customer name (POS's
 * "returning customer" hint) — exact case-insensitive match, like legacy. */
export async function fetchLastVisit(supabase: SupabaseClient, customerName: string): Promise<Sale | null> {
  const name = customerName.trim();
  if (!name) return null;
  const { data, error } = await supabase
    .from('sales')
    .select(SALE_COLUMNS)
    .ilike('customer_name', name)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as SaleQueryRow;
  return toSale(row as never, one(row.cashier)?.full_name ?? null);
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
