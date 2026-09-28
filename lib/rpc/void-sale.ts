// Wraps public.void_sale. Flips the sale to void and restocks exactly what
// it deducted — the branch's own cashier/manager, or an owner. Refuses an
// already-void sale (hint 'already_void').
import type { SupabaseClient } from '@supabase/supabase-js';
import { callRpc } from '@/lib/rpc/errors';
import { toSale } from '@/lib/mappers';
import type { Sale } from '@/lib/types';

export async function voidSale(supabase: SupabaseClient, saleId: string, reason: string): Promise<Sale> {
  const row = await callRpc(supabase.rpc('void_sale', { sale_id: saleId, reason }));
  return toSale(row);
}
