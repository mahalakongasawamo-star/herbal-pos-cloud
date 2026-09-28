// Live per-branch stock. RLS already scopes this to the caller's branch(es)
// — no explicit branch filter needed for "what am I allowed to see."
import type { SupabaseClient } from '@supabase/supabase-js';
import { toStockBalance } from '@/lib/mappers';
import type { StockBalance } from '@/lib/types';

export async function fetchStockBalances(supabase: SupabaseClient): Promise<StockBalance[]> {
  const { data, error } = await supabase.from('stock_balances').select('*');
  if (error) throw error;
  return data.map(toStockBalance);
}

/** {branchId::productId -> qty}, the shape most screens actually index by. */
export function indexStockBalances(rows: StockBalance[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[`${r.branchId}::${r.productId}`] = r.qty;
  return out;
}

export const onHand = (index: Record<string, number>, branchId: string, productId: string): number =>
  index[`${branchId}::${productId}`] ?? 0;
