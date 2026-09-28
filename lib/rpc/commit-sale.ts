// Wraps public.commit_sale (supabase/migrations/20260927140200_rpcs.sql).
// One atomic transaction: pricing is recomputed and validated server-side,
// stock is checked and deducted, and the receipt number is issued — all in
// the same call. The client's own total (via lib/pricing.js computeCart) is
// only ever a preview; expectedTotal is what the server checks it against.
import type { SupabaseClient } from '@supabase/supabase-js';
import { callRpc } from '@/lib/rpc/errors';
import { toSale } from '@/lib/mappers';
import type { CustomerTier, Sale } from '@/lib/types';

export interface CommitSaleLine {
  productId: string;
  qty: number;
}

export interface CommitSaleInput {
  /** The POS draft's own id — the idempotency key. A retry with the exact
   * same content and this ref returns the original sale instead of selling
   * twice; a retry whose content changed is refused (hint 'already_saved'). */
  clientRef: string;
  /** Required for owner / an all-branch manager (who has no default branch);
   * omit for single-branch staff, whose own branch is used automatically. */
  branchId?: string;
  customerName: string;
  leaderName?: string;
  uplineName?: string;
  customerTier: CustomerTier;
  /** Required when customerTier is 'Member'. */
  memberTier?: string;
  paymentMethodId: string;
  /** Required for a cash payment method; must be >= the total. */
  tendered?: number;
  /** Non-cash payment reference number. */
  reference?: string;
  /** The total the POS is showing. Rejected (hint 'price_mismatch') if the
   * server's own recompute differs by more than a centavo — e.g. a price
   * changed underneath an open ticket. */
  expectedTotal: number;
  lines: CommitSaleLine[];
}

export async function commitSale(supabase: SupabaseClient, input: CommitSaleInput): Promise<Sale> {
  const payload = {
    client_ref: input.clientRef,
    branch_id: input.branchId,
    customer_name: input.customerName,
    leader_name: input.leaderName ?? '',
    upline_name: input.uplineName ?? '',
    customer_tier: input.customerTier,
    member_tier: input.customerTier === 'Member' ? input.memberTier : undefined,
    payment_method_id: input.paymentMethodId,
    tendered: input.tendered,
    reference: input.reference ?? '',
    expected_total: input.expectedTotal,
    lines: input.lines.map((l) => ({ product_id: l.productId, qty: l.qty })),
  };
  const row = await callRpc(supabase.rpc('commit_sale', { payload }));
  return toSale(row);
}
