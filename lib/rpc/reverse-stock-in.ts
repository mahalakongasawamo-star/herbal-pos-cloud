// Wraps public.reverse_stock_in. Refuses — changing nothing — if any of the
// batch has already been sold (hint 'would_go_negative'); refuses an
// already-reversed batch (hint 'already_reversed'). Cashiers may only
// reverse a batch they received themselves; manager/owner may reverse any.
import type { SupabaseClient } from '@supabase/supabase-js';
import { callRpc } from '@/lib/rpc/errors';

export async function reverseStockIn(supabase: SupabaseClient, stockInId: string): Promise<void> {
  await callRpc(supabase.rpc('reverse_stock_in', { stock_in_id: stockInId }));
}
