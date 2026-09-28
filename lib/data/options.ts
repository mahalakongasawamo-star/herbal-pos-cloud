// Options page's owner-only writes on member_tiers and payment_methods —
// direct table CRUD (RLS already restricts writes to the owner), no RPC
// needed since these never touch money or stock.
import type { SupabaseClient } from '@supabase/supabase-js';

export async function addMemberTier(supabase: SupabaseClient, name: string): Promise<void> {
  const max = await supabase.from('member_tiers').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  if (max.error) throw max.error;
  const { error } = await supabase.from('member_tiers').insert({ name, discount_pct: 0, sort_order: (max.data?.sort_order ?? 0) + 1 });
  if (error) throw error;
}

export async function removeMemberTier(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('member_tiers').delete().eq('id', id);
  if (error) throw error;
}

export async function setMemberTierDiscount(supabase: SupabaseClient, id: string, discountPct: number): Promise<void> {
  // Rounded to 1 dp: the DB column is numeric(4,1) and rounds silently on
  // write, but rounding here too keeps the UI's own display in sync
  // immediately rather than waiting on a refetch.
  const { error } = await supabase.from('member_tiers').update({ discount_pct: Math.round(discountPct * 10) / 10 }).eq('id', id);
  if (error) throw error;
}

/** Swaps two tiers' sort_order — the Up/Down reordering buttons. */
export async function swapMemberTierOrder(supabase: SupabaseClient, a: { id: string; sortOrder: number }, b: { id: string; sortOrder: number }): Promise<void> {
  const r1 = await supabase.from('member_tiers').update({ sort_order: b.sortOrder }).eq('id', a.id);
  if (r1.error) throw r1.error;
  const r2 = await supabase.from('member_tiers').update({ sort_order: a.sortOrder }).eq('id', b.id);
  if (r2.error) throw r2.error;
}

export async function addPaymentMethod(supabase: SupabaseClient, name: string, isCash: boolean): Promise<void> {
  const max = await supabase.from('payment_methods').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  if (max.error) throw max.error;
  const { error } = await supabase.from('payment_methods').insert({ name, is_cash: isCash, sort_order: (max.data?.sort_order ?? 0) + 1 });
  if (error) throw error;
}

export async function removePaymentMethod(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('payment_methods').delete().eq('id', id);
  if (error) throw error;
}

export async function setPaymentMethodIsCash(supabase: SupabaseClient, id: string, isCash: boolean): Promise<void> {
  const { error } = await supabase.from('payment_methods').update({ is_cash: isCash }).eq('id', id);
  if (error) throw error;
}
