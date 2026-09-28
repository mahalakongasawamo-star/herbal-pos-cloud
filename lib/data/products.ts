// Product master's direct table writes (owner-only — enforced by RLS, not
// just by hiding the screen). Creating a NEW product with opening stock
// still goes through receive_stock (lib/rpc/receive-stock.ts) — same as
// legacy, which routed every "add product" flow through RECEIVE_STOCK, not
// a direct insert. This file is for editing what already exists.
import type { SupabaseClient } from '@supabase/supabase-js';
import { toCategory } from '@/lib/mappers';
import type { Category } from '@/lib/types';

export interface ProductPatch {
  name?: string;
  /** Category NAME — resolved to (or creates) a categories row of the
   * product's own is_package-ness, same as legacy's category picker. */
  category?: string;
  price?: number;
  memberPrice?: number;
  tierPrices?: Record<string, number>;
  reorderLevel?: number;
  active?: boolean;
  /** Packages only. A full replacement of contents (delete + reinsert),
   * matching legacy's "tierPrices always replaces the whole map" pattern —
   * simplest to reason about, and package edits are rare/deliberate. */
  inclusions?: { productId: string; qty: number }[];
}

export async function updateProduct(
  supabase: SupabaseClient,
  productId: string,
  isPackage: boolean,
  patch: ProductPatch,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.memberPrice !== undefined) row.member_price = patch.memberPrice;
  if (patch.tierPrices !== undefined) row.tier_prices = patch.tierPrices;
  if (patch.reorderLevel !== undefined) row.reorder_level = patch.reorderLevel;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.category !== undefined) {
    row.category_id = (await resolveCategory(supabase, patch.category, isPackage)).id;
  }

  if (Object.keys(row).length > 0) {
    const { error } = await supabase.from('products').update(row).eq('id', productId);
    if (error) throw error;
  }

  if (isPackage && patch.inclusions !== undefined) {
    const del = await supabase.from('package_inclusions').delete().eq('package_product_id', productId);
    if (del.error) throw del.error;
    if (patch.inclusions.length > 0) {
      const ins = await supabase.from('package_inclusions').insert(
        patch.inclusions.map((i) => ({ package_product_id: productId, component_product_id: i.productId, qty: i.qty })),
      );
      if (ins.error) throw ins.error;
    }
  }
}

/** Finds a category by name (matching this product's package-ness), or
 * creates it — same "type-scoped, create-on-the-fly" behaviour as legacy's
 * ProductForm category picker. */
export async function resolveCategory(supabase: SupabaseClient, name: string, isPackage: boolean): Promise<Category> {
  const existing = await supabase.from('categories').select('*').eq('name', name).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return toCategory(existing.data);

  const maxOrder = await supabase.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  if (maxOrder.error) throw maxOrder.error;
  const sortOrder = (maxOrder.data?.sort_order ?? 0) + 1;

  const created = await supabase.from('categories').insert({ name, is_package: isPackage, sort_order: sortOrder }).select('*').single();
  if (created.error) throw created.error;
  return toCategory(created.data);
}
