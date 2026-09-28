// Report-scoped sale fetch: all completed sales (with line items) in a date
// range, optionally filtered by branch/cashier. Unlike lib/data/sales.ts
// (paginated for the Sales log screen), a report needs the *whole* matching
// set in one shot to aggregate client-side, so this embeds sale_items
// directly in the same query (same pattern as fetchSaleWithItems) rather
// than paging — capped at REPORT_SALE_CAP as a sanity bound, not a UI page
// size.
import type { SupabaseClient } from '@supabase/supabase-js';
import { toSale } from '@/lib/mappers';
import type { Sale } from '@/lib/types';

interface ReportSaleRow {
  [key: string]: unknown;
  cashier: { full_name: string } | { full_name: string }[] | null;
  sale_items: unknown[];
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const REPORT_SALE_CAP = 5000;

export interface ReportSalesFilter {
  /** Half-open range, ISO timestamps (any offset — Postgres compares instants). */
  from: string;
  to: string;
  branchId?: string;
  cashierId?: string;
}

/** Completed sales only — voided receipts are excluded here so every panel
 * fed by this fetch is void-safe by construction (Reports.jsx's per-sale
 * `if (s.status === 'void') continue;` guard is kept too, as defense in
 * depth, in reports-client.tsx). */
export async function fetchReportSales(supabase: SupabaseClient, filter: ReportSalesFilter): Promise<Sale[]> {
  let q = supabase
    .from('sales')
    .select('*, cashier:profiles!sales_cashier_id_fkey(full_name), sale_items(*)')
    .eq('status', 'completed')
    .gte('created_at', filter.from)
    .lt('created_at', filter.to)
    .order('created_at', { ascending: true })
    .limit(REPORT_SALE_CAP);

  if (filter.branchId) q = q.eq('branch_id', filter.branchId);
  if (filter.cashierId) q = q.eq('cashier_id', filter.cashierId);

  const { data, error } = await q;
  if (error) throw error;
  const rows = data as unknown as ReportSaleRow[];
  return rows.map((r) => toSale(r as never, one(r.cashier)?.full_name ?? null, r.sale_items as never[]));
}
