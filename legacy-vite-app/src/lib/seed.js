import { cleanSku, norm } from './format';

// Master catalog exactly as given in the brief. Prices start at 0 and are
// set in Product master. Packages are compositions, not stock items.
export const SEED_CATALOG = [
  {
    category: 'Entry Packages',
    isPackage: true,
    items: [
      { sku: 'PKG-AFF', name: 'Affiliate Package', inclusions: [{ sku: 'HD-TIB', qty: 2 }] },
      { sku: 'PKG-SUP', name: 'Supervisor Package', inclusions: [{ sku: 'HD-TIB', qty: 6 }] },
      { sku: 'PKG-MGR', name: 'Manager Package', inclusions: [{ sku: 'HD-TIB', qty: 14 }] },
      { sku: 'PKG-PRS', name: 'Presidential Package', inclusions: [{ sku: 'HD-TIB', qty: 30 }] },
    ],
  },
  {
    category: 'Health Drink',
    isPackage: false,
    items: [{ sku: 'HD-TIB', name: 'Dok Honey’s Tibicos', price: 0, memberPrice: 0, reorderLevel: 10 }],
  },
  {
    category: 'Organic Coffee',
    isPackage: false,
    items: [
      { sku: 'OC-MAH', name: 'Maharlika Herbal Coffee', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OC-INS', name: 'Insulin Herbal Coffee', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OC-RC400', name: 'Rice Coffee (400g)', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OC-RC450', name: 'Rice Coffee (450g)', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OC-CC', name: 'Corn Coffee', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OC-RCC', name: 'Rice-Corn Coffee', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OC-KRM', name: 'KapeRico Malunggay', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OC-KRT', name: 'KapeRico Turmeric', price: 0, memberPrice: 0, reorderLevel: 10 },
    ],
  },
  {
    category: 'Organic Powder',
    isPackage: false,
    items: [
      { sku: 'OP-TUR', name: 'Turmeric Powder', price: 0, memberPrice: 0, reorderLevel: 5 },
      { sku: 'OP-MAL', name: 'Malunggay Powder', price: 0, memberPrice: 0, reorderLevel: 5 },
    ],
  },
  {
    category: 'Organic Rub',
    isPackage: false,
    items: [
      { sku: 'OR-EUC', name: 'Herbal Rub Eucalyptus', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OR-LAV', name: 'Herbal Rub Lavender', price: 0, memberPrice: 0, reorderLevel: 10 },
    ],
  },
  {
    category: 'Oils',
    isPackage: false,
    items: [
      { sku: 'OIL-HER', name: 'Essential Oil Heritage', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OIL-VIN', name: 'Essential Oil Vintage', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OIL-MAN', name: 'Essential Oil Manang Biday', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OIL-LUV', name: 'Essential Oil Luv', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OIL-GIN', name: 'Essential Oil Ginger', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OIL-ROS', name: 'Essential Oil Rosemary', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'OIL-TUI', name: 'Essential Oil Tui-na', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'HO-PEP', name: 'Herbal Oil Peppermint', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'HO-ALI', name: 'Herbal Oil Alingatong', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'HO-ORA', name: 'Herbal Oil Orange', price: 0, memberPrice: 0, reorderLevel: 10 },
    ],
  },
  {
    category: 'Liquid',
    isPackage: false,
    items: [
      { sku: 'LQ-PAR', name: 'PAREC Vinegar', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'LQ-KEF', name: 'Kefiranza Wine', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'LQ-HON150', name: 'Pure Honey (150mL)', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'LQ-HON250', name: 'Pure Honey (250mL)', price: 0, memberPrice: 0, reorderLevel: 10 },
      { sku: 'LQ-HON350', name: 'Pure Honey (350mL)', price: 0, memberPrice: 0, reorderLevel: 10 },
    ],
  },
];

export const CUSTOMER_TIERS = ['New', 'Member'];
export const DEFAULT_COMPANY = 'Your Company Name';

export const DEFAULT_SETTINGS = {
  companyName: DEFAULT_COMPANY,
  companyDetails: 'Store address, contact number',
  receiptTitle: 'Sales receipt',
  receiptFooter: 'Thank you for your purchase!',
  logo: '',
  printLayout: 'stacked', // 'stacked' (top/bottom) | 'side' (side by side)
  optionsReviewed: false,
};

export const DEFAULT_OPTIONS = {
  cashiers: ['MNLA-Cashier', 'BAGUIO-Cashier'],
  paymentMethods: [
    { name: 'Cash', isCash: true },
    { name: 'GCash', isCash: false },
    { name: 'GoTyme', isCash: false },
    { name: 'Bank Transfer', isCash: false },
  ],
  memberTiers: [
    { name: 'Affiliate', discountPct: 0 },
    { name: 'Supervisor', discountPct: 0 },
    { name: 'Manager', discountPct: 0 },
    { name: 'Presidential', discountPct: 0 },
  ],
};

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Normalizes any product-shaped object into the stored product shape. */
export function normalizeProduct(p) {
  const isPackage = !!p.isPackage;
  const tierPrices = {};
  if (p.tierPrices && typeof p.tierPrices === 'object') {
    for (const [k, v] of Object.entries(p.tierPrices)) if (n(v) > 0) tierPrices[k] = n(v);
  }
  return {
    sku: cleanSku(p.sku),
    name: norm(p.name),
    category: norm(p.category) || (isPackage ? 'Entry Packages' : 'Uncategorized'),
    isPackage,
    price: Math.max(0, n(p.price)),
    memberPrice: Math.max(0, n(p.memberPrice)),
    tierPrices,
    reorderLevel: isPackage ? 0 : Math.max(0, Math.floor(n(p.reorderLevel ?? 10))),
    inclusions: isPackage
      ? (Array.isArray(p.inclusions) ? p.inclusions : [])
          .map((i) => ({ sku: cleanSku(i.sku), qty: Math.max(1, Math.floor(n(i.qty) || 1)) }))
          .filter((i) => i.sku)
      : [],
    active: p.active !== false,
  };
}

export function createInitialData() {
  const categories = [];
  const products = [];
  const stock = {};
  for (const c of SEED_CATALOG) {
    categories.push({ name: c.category, isPackage: !!c.isPackage });
    for (const it of c.items) {
      const p = normalizeProduct({ ...it, category: c.category, isPackage: c.isPackage });
      products.push(p);
      if (!p.isPackage) stock[p.sku] = { added: 0, sold: 0 };
    }
  }
  return {
    app: 'herbal-pos',
    version: 1,
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    options: JSON.parse(JSON.stringify(DEFAULT_OPTIONS)),
    categories,
    products,
    stock,
    stockIns: [],
    sales: [],
    seq: 0,
  };
}

/** True when an object looks like this app's data (used to validate imports). */
export function looksLikeData(raw) {
  return !!raw && typeof raw === 'object' && Array.isArray(raw.products) && Array.isArray(raw.sales);
}

/** Merge stored data with defaults so older or partial data never crashes the app. */
export function hydrate(raw) {
  const base = createInitialData();
  if (!looksLikeData(raw)) return base;
  const o = raw.options || {};
  const d = {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    options: {
      cashiers:
        Array.isArray(o.cashiers) && o.cashiers.length ? o.cashiers.map(norm).filter(Boolean) : base.options.cashiers,
      paymentMethods:
        Array.isArray(o.paymentMethods) && o.paymentMethods.length
          ? o.paymentMethods.map((pm) =>
              typeof pm === 'string' ? { name: pm, isCash: pm.toLowerCase() === 'cash' } : { name: norm(pm.name), isCash: !!pm.isCash },
            )
          : base.options.paymentMethods,
      memberTiers:
        Array.isArray(o.memberTiers) && o.memberTiers.length
          ? o.memberTiers.map((t) =>
              typeof t === 'string' ? { name: t, discountPct: 0 } : { name: norm(t.name), discountPct: n(t.discountPct) },
            )
          : base.options.memberTiers,
    },
    products: raw.products.map(normalizeProduct).filter((p) => p.sku),
    stock: raw.stock && typeof raw.stock === 'object' ? { ...raw.stock } : {},
    stockIns: Array.isArray(raw.stockIns) ? raw.stockIns : [],
    sales: raw.sales,
    seq: Number.isFinite(raw.seq) ? raw.seq : raw.sales.length,
  };
  for (const p of d.products) if (!p.isPackage && !d.stock[p.sku]) d.stock[p.sku] = { added: 0, sold: 0 };
  const cats = Array.isArray(raw.categories) ? raw.categories.filter((c) => c && c.name) : [];
  for (const p of d.products) {
    if (!cats.some((c) => c.name === p.category)) cats.push({ name: p.category, isPackage: p.isPackage });
  }
  d.categories = cats.length ? cats : base.categories;
  return d;
}

// Category colour keys (used as small markers on tiles and tables).
const CATEGORY_HUES = {
  'Entry Packages': '#B03A5B',
  'Health Drink': '#2A9D8F',
  'Organic Coffee': '#8A5632',
  'Organic Powder': '#5C8A2E',
  'Organic Rub': '#8B6BB5',
  Oils: '#C8662A',
  Liquid: '#C9960F',
};
const FALLBACK_HUES = ['#4F7CAC', '#6B7C93', '#9C6644', '#3F8F6A', '#A15C8C', '#7C8B2E'];
export function categoryHue(name) {
  if (CATEGORY_HUES[name]) return CATEGORY_HUES[name];
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_HUES[h % FALLBACK_HUES.length];
}
