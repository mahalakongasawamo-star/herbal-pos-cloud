// App-level, camelCase types — the shape every module works with, mapped
// from the generated (snake_case) database types in types/database.ts.
// Keeping this boundary means a module's own logic (much of it ported
// near-verbatim from the legacy reducer/pricing shapes) doesn't need to
// know or care about the DB's column naming.
import type { Database } from '@/types/database';

type Tables = Database['public']['Tables'];
export type BranchRow = Tables['branches']['Row'];
export type CategoryRow = Tables['categories']['Row'];
export type ProductRow = Tables['products']['Row'];
export type PackageInclusionRow = Tables['package_inclusions']['Row'];
export type MemberTierRow = Tables['member_tiers']['Row'];
export type PaymentMethodRow = Tables['payment_methods']['Row'];
export type StockBalanceRow = Tables['stock_balances']['Row'];
export type StockLedgerRow = Tables['stock_ledger']['Row'];
export type StockInRow = Tables['stock_ins']['Row'];
export type SaleRow = Tables['sales']['Row'];
export type SaleItemRow = Tables['sale_items']['Row'];

export interface Branch {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  isPackage: boolean;
  sortOrder: number;
}

/** A package's contents, resolved: [{ sku, name, qty }]. */
export interface Inclusion {
  productId: string;
  sku: string;
  name: string;
  qty: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  category: string;
  isPackage: boolean;
  price: number;
  memberPrice: number;
  /** Only positive numbers survive the DB's own canonicalizing trigger. */
  tierPrices: Record<string, number>;
  reorderLevel: number;
  active: boolean;
  /** Packages only. Empty for stock items. */
  inclusions: Inclusion[];
}

export interface MemberTier {
  id: string;
  name: string;
  discountPct: number;
  sortOrder: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  isCash: boolean;
  sortOrder: number;
}

/** One branch's on-hand quantity for one product (stock items only). */
export interface StockBalance {
  branchId: string;
  productId: string;
  qty: number;
  updatedAt: string;
}

export type StockLedgerReason = 'receive' | 'sale' | 'void_restock' | 'reversal' | 'adjustment';

export interface StockLedgerEntry {
  id: string;
  branchId: string;
  productId: string;
  delta: number;
  reason: StockLedgerReason;
  refSaleId: string | null;
  refStockInId: string | null;
  note: string;
  createdBy: string | null;
  createdAt: string;
}

export interface StockIn {
  id: string;
  branchId: string;
  date: string;
  note: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  reversed: boolean;
  reversedAt: string | null;
}

export type CustomerTier = 'New' | 'Member';
export type SaleStatus = 'completed' | 'void';

export interface SaleItem {
  id: string;
  lineNo: number;
  productId: string;
  sku: string;
  name: string;
  category: string;
  isPackage: boolean;
  qty: number;
  unitPrice: number;
  chargedUnit: number;
  gross: number;
  discount: number;
  net: number;
  ruleLabel: string;
  /** Package snapshot only: [{ sku, name, qty }]. */
  inclusions: { sku: string; name: string; qty: number }[] | null;
}

export interface Sale {
  id: string;
  branchId: string;
  receiptNo: string;
  clientRef: string;
  customerName: string;
  leaderName: string;
  uplineName: string;
  customerTier: CustomerTier;
  memberTier: string | null;
  cashierId: string;
  cashierName: string | null;
  paymentMethodId: string;
  paymentMethodName: string;
  isCash: boolean;
  reference: string;
  grossTotal: number;
  discountTotal: number;
  totalDue: number;
  tendered: number;
  change: number;
  status: SaleStatus;
  voidReason: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  createdAt: string;
  /** Present when fetched with its lines (sale detail / receipt / ticket view). */
  items?: SaleItem[];
}

/** The pricing/stock context a cart computation needs (lib/pricing.js's `ctx`). */
export interface PricingContext {
  customerTier: CustomerTier;
  memberTier: string;
  tiers: MemberTier[];
}

/** Store/receipt branding — a true singleton row (supabase/migrations/
 * 20260929100000_settings.sql). Not in SPEC.md §3; added in Phase 1 once
 * Options and receipt printing needed somewhere to keep it. */
export interface Settings {
  companyName: string;
  companyDetails: string;
  receiptTitle: string;
  receiptFooter: string;
  logo: string;
  printLayout: 'stacked' | 'side';
  optionsReviewed: boolean;
  updatedAt: string;
}
