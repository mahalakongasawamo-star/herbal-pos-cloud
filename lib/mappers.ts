// snake_case DB rows -> camelCase app types (lib/types.ts). Centralized so
// every query module and RPC wrapper produces the same shape.
import type {
  Branch,
  BranchRow,
  Category,
  CategoryRow,
  Inclusion,
  MemberTier,
  MemberTierRow,
  PaymentMethod,
  PaymentMethodRow,
  Product,
  ProductRow,
  Sale,
  SaleItem,
  SaleItemRow,
  SaleRow,
  StockBalance,
  StockBalanceRow,
  StockIn,
  StockInRow,
  StockLedgerEntry,
  StockLedgerRow,
} from '@/lib/types';

export function toBranch(r: BranchRow): Branch {
  return { id: r.id, code: r.code, name: r.name, active: r.active };
}

export function toCategory(r: CategoryRow): Category {
  return { id: r.id, name: r.name, isPackage: r.is_package, sortOrder: r.sort_order };
}

export function toMemberTier(r: MemberTierRow): MemberTier {
  return { id: r.id, name: r.name, discountPct: Number(r.discount_pct), sortOrder: r.sort_order };
}

export function toPaymentMethod(r: PaymentMethodRow): PaymentMethod {
  return { id: r.id, name: r.name, isCash: r.is_cash, sortOrder: r.sort_order };
}

/** tier_prices is jsonb; the DB's own write-trigger already canonicalizes it
 * to only-positive-numbers, but a value read straight off the wire is still
 * `unknown` to TypeScript, so this re-validates rather than casting blindly. */
function toTierPrices(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'number' && v > 0) out[k] = v;
    }
  }
  return out;
}

/** `category` is the joined categories.name (from a `products(*, category:categories(name))`
 * select) — pass it separately since ProductRow itself only has category_id. */
export function toProduct(r: ProductRow, category: string, inclusions: Inclusion[] = []): Product {
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    categoryId: r.category_id,
    category,
    isPackage: r.is_package,
    price: Number(r.price),
    memberPrice: Number(r.member_price),
    tierPrices: toTierPrices(r.tier_prices),
    reorderLevel: r.reorder_level,
    active: r.active,
    inclusions,
  };
}

export function toStockBalance(r: StockBalanceRow): StockBalance {
  return { branchId: r.branch_id, productId: r.product_id, qty: r.qty, updatedAt: r.updated_at };
}

export function toStockLedgerEntry(r: StockLedgerRow): StockLedgerEntry {
  return {
    id: r.id,
    branchId: r.branch_id,
    productId: r.product_id,
    delta: r.delta,
    reason: r.reason as StockLedgerEntry['reason'],
    refSaleId: r.ref_sale_id,
    refStockInId: r.ref_stock_in_id,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export function toStockIn(r: StockInRow, createdByName: string | null = null): StockIn {
  return {
    id: r.id,
    branchId: r.branch_id,
    date: r.date,
    note: r.note,
    createdBy: r.created_by,
    createdByName,
    createdAt: r.created_at,
    reversed: r.reversed,
    reversedAt: r.reversed_at,
  };
}

export function toSale(r: SaleRow, cashierName: string | null = null, items?: SaleItemRow[]): Sale {
  return {
    id: r.id,
    branchId: r.branch_id,
    receiptNo: r.receipt_no,
    clientRef: r.client_ref,
    customerName: r.customer_name,
    leaderName: r.leader_name,
    uplineName: r.upline_name,
    customerTier: r.customer_tier as Sale['customerTier'],
    memberTier: r.member_tier,
    cashierId: r.cashier_id,
    cashierName,
    paymentMethodId: r.payment_method_id,
    paymentMethodName: r.payment_method_name,
    isCash: r.is_cash,
    reference: r.reference,
    grossTotal: Number(r.gross_total),
    discountTotal: Number(r.discount_total),
    totalDue: Number(r.total_due),
    tendered: Number(r.tendered),
    change: Number(r.change),
    status: r.status as Sale['status'],
    voidReason: r.void_reason,
    voidedAt: r.voided_at,
    voidedBy: r.voided_by,
    createdAt: r.created_at,
    items: items?.map(toSaleItem),
  };
}

export function toSaleItem(r: SaleItemRow): SaleItem {
  return {
    id: r.id,
    lineNo: r.line_no,
    productId: r.product_id,
    sku: r.sku,
    name: r.name,
    category: r.category,
    isPackage: r.is_package,
    qty: r.qty,
    unitPrice: Number(r.unit_price),
    chargedUnit: Number(r.charged_unit),
    gross: Number(r.gross),
    discount: Number(r.discount),
    net: Number(r.net),
    ruleLabel: r.rule_label,
    inclusions: Array.isArray(r.inclusions) ? (r.inclusions as SaleItem['inclusions']) : null,
  };
}
