// The reference catalog every screen needs: categories, products (with
// package contents resolved), member tiers, payment methods. Small and
// slow-changing — safe to load in full and keep in memory, same as the
// legacy app did, just from Postgres instead of IndexedDB.
import type { SupabaseClient } from '@supabase/supabase-js';
import { toCategory, toMemberTier, toPaymentMethod, toProduct } from '@/lib/mappers';
import type { Category, Inclusion, MemberTier, PaymentMethod, Product } from '@/lib/types';

export interface Catalog {
  categories: Category[];
  products: Product[];
  memberTiers: MemberTier[];
  paymentMethods: PaymentMethod[];
}

interface ProductQueryRow {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  is_package: boolean;
  price: number;
  member_price: number;
  tier_prices: unknown;
  reorder_level: number;
  active: boolean;
  category: { name: string } | { name: string }[] | null;
  package_inclusions: { qty: number; component: { id: string; sku: string; name: string } | { id: string; sku: string; name: string }[] }[];
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function fetchCatalog(supabase: SupabaseClient): Promise<Catalog> {
  const [categoriesRes, productsRes, tiersRes, methodsRes] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase
      .from('products')
      .select(
        `id, sku, name, category_id, is_package, price, member_price, tier_prices, reorder_level, active,
         category:categories(name),
         package_inclusions!package_inclusions_package_product_id_fkey(qty, component:products!package_inclusions_component_product_id_fkey(id, sku, name))`,
      )
      .order('name'),
    supabase.from('member_tiers').select('*').order('sort_order'),
    supabase.from('payment_methods').select('*').order('sort_order'),
  ]);
  if (categoriesRes.error) throw categoriesRes.error;
  if (productsRes.error) throw productsRes.error;
  if (tiersRes.error) throw tiersRes.error;
  if (methodsRes.error) throw methodsRes.error;

  const products = (productsRes.data as unknown as ProductQueryRow[]).map((r) => {
    const category = one(r.category)?.name ?? '';
    const inclusions: Inclusion[] = r.is_package
      ? (r.package_inclusions ?? [])
          .map((pi) => {
            const c = one(pi.component);
            return c ? { productId: c.id, sku: c.sku, name: c.name, qty: pi.qty } : null;
          })
          .filter((x): x is Inclusion => x !== null)
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
    return toProduct(
      {
        id: r.id,
        sku: r.sku,
        name: r.name,
        category_id: r.category_id,
        is_package: r.is_package,
        price: r.price,
        member_price: r.member_price,
        // My own query-row shape declares this `unknown` (the DB's real Json
        // type is stricter than we need here); toProduct/toTierPrices
        // re-validates it at runtime regardless of what TS believes it is.
        tier_prices: r.tier_prices as never,
        reorder_level: r.reorder_level,
        active: r.active,
        created_at: '',
        updated_at: '',
      },
      category,
      inclusions,
    );
  });

  return {
    categories: categoriesRes.data.map(toCategory),
    products,
    memberTiers: tiersRes.data.map(toMemberTier),
    paymentMethods: methodsRes.data.map(toPaymentMethod),
  };
}
