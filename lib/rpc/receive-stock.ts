// Wraps public.receive_stock. Registers manager: manager or owner; setting
// a price, creating a package, or giving a package its contents needs the
// owner. An existing SKU is left entirely as-is. Returns the new stock_ins
// header, or null when the call only registered products (no entries).
import type { SupabaseClient } from '@supabase/supabase-js';
import { callRpc } from '@/lib/rpc/errors';
import { toStockIn } from '@/lib/mappers';
import type { StockIn } from '@/lib/types';

export interface ReceiveStockEntry {
  /** One of productId or sku — productId is preferred when already known. */
  productId?: string;
  sku?: string;
  qty: number;
  note?: string;
}

export interface NewProductInput {
  sku: string;
  name: string;
  category?: string;
  isPackage?: boolean;
  /** Owner only: a non-owner registering a priced product is refused. */
  price?: number;
  memberPrice?: number;
  tierPrices?: Record<string, number>;
  reorderLevel?: number;
  /** Owner-only: only the owner may create a package or give it contents. */
  inclusions?: { sku: string; qty: number }[];
}

export interface ReceiveStockInput {
  branchId: string;
  entries: ReceiveStockEntry[];
  newProducts?: NewProductInput[];
  /** Defaults to today (Asia/Manila) server-side. */
  stockDate?: string;
  note?: string;
}

export async function receiveStock(supabase: SupabaseClient, input: ReceiveStockInput): Promise<StockIn | null> {
  const entries = input.entries.map((e) => ({
    product_id: e.productId,
    sku: e.sku,
    qty: e.qty,
    note: e.note,
  }));
  const newProducts = (input.newProducts ?? []).map((p) => ({
    sku: p.sku,
    name: p.name,
    category: p.category,
    is_package: p.isPackage ?? false,
    price: p.price,
    member_price: p.memberPrice,
    tier_prices: p.tierPrices,
    reorder_level: p.reorderLevel,
    inclusions: p.inclusions,
  }));
  const rows = await callRpc(
    supabase.rpc('receive_stock', {
      branch_id: input.branchId,
      entries,
      new_products: newProducts,
      stock_date: input.stockDate,
      note: input.note ?? '',
    }),
  );
  return rows[0] ? toStockIn(rows[0]) : null;
}
