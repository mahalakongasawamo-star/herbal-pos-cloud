import { normalizeProduct } from './seed';
import { onHand, shortfalls } from './pricing';
import { uid } from './format';

// Every write goes through here. Each action is one pure state transition, so a
// package sale that deducts several SKUs either applies completely or not at
// all, and the whole snapshot is persisted together.
export function reducer(state, action) {
  if (!state && action.type !== 'REPLACE') return state;
  switch (action.type) {
    case 'REPLACE':
      return action.data;

    case 'COMMIT_SALE': {
      const sale = action.sale;
      if (state.sales.some((s) => s.receiptNo === sale.receiptNo)) return state;
      if (shortfalls(sale.deductions, state.stock).length) return state;
      const stock = { ...state.stock };
      for (const [sku, q] of Object.entries(sale.deductions)) {
        const row = stock[sku] || { added: 0, sold: 0 };
        stock[sku] = { ...row, sold: (Number(row.sold) || 0) + q };
      }
      return { ...state, stock, sales: [...state.sales, sale], seq: (state.seq || 0) + 1 };
    }

    case 'VOID_SALE': {
      const idx = state.sales.findIndex((s) => s.receiptNo === action.receiptNo);
      if (idx < 0 || state.sales[idx].status === 'void') return state;
      const sale = state.sales[idx];
      const stock = { ...state.stock };
      for (const [sku, q] of Object.entries(sale.deductions || {})) {
        const row = stock[sku] || { added: 0, sold: 0 };
        stock[sku] = { ...row, sold: Math.max(0, (Number(row.sold) || 0) - q) };
      }
      const sales = state.sales.slice();
      sales[idx] = { ...sale, status: 'void', voidedAt: new Date().toISOString(), voidReason: action.reason || '' };
      return { ...state, stock, sales };
    }

    case 'RECEIVE_STOCK': {
      let products = state.products;
      let categories = state.categories;
      const stock = { ...state.stock };
      for (const raw of action.newProducts || []) {
        const p = normalizeProduct(raw);
        if (!p.sku || products.some((x) => x.sku === p.sku)) continue;
        products = [...products, p];
        if (!p.isPackage) stock[p.sku] = stock[p.sku] || { added: 0, sold: 0 };
        if (!categories.some((c) => c.name === p.category)) categories = [...categories, { name: p.category, isPackage: p.isPackage }];
      }
      const stockable = new Set(products.filter((p) => !p.isPackage).map((p) => p.sku));
      const ts = new Date().toISOString();
      const entries = (action.entries || [])
        .filter((e) => stockable.has(e.sku) && Math.floor(Number(e.qty)) > 0)
        .map((e) => ({ id: uid(), date: e.date, sku: e.sku, qty: Math.floor(Number(e.qty)), note: e.note || '', ts }));
      if (!entries.length && products === state.products) return state;
      for (const e of entries) {
        const row = stock[e.sku] || { added: 0, sold: 0 };
        stock[e.sku] = { ...row, added: (Number(row.added) || 0) + e.qty };
      }
      return { ...state, products, categories, stock, stockIns: [...entries, ...state.stockIns] };
    }

    case 'REVERSE_STOCK_IN': {
      const e = state.stockIns.find((x) => x.id === action.id);
      if (!e || e.reversed) return state;
      const row = state.stock[e.sku] || { added: 0, sold: 0 };
      if (onHand(row) - e.qty < 0) return state;
      return {
        ...state,
        stock: { ...state.stock, [e.sku]: { ...row, added: (Number(row.added) || 0) - e.qty } },
        stockIns: state.stockIns.map((x) => (x.id === e.id ? { ...x, reversed: true, reversedAt: new Date().toISOString() } : x)),
      };
    }

    case 'ADD_PRODUCT': {
      const p = normalizeProduct(action.product);
      if (!p.sku || !p.name || state.products.some((x) => x.sku === p.sku)) return state;
      const categories = state.categories.some((c) => c.name === p.category)
        ? state.categories
        : [...state.categories, { name: p.category, isPackage: p.isPackage }];
      const stock = p.isPackage ? state.stock : { ...state.stock, [p.sku]: state.stock[p.sku] || { added: 0, sold: 0 } };
      return { ...state, products: [...state.products, p], categories, stock };
    }

    case 'UPDATE_PRODUCT': {
      let changed = null;
      const products = state.products.map((p) => {
        if (p.sku !== action.sku) return p;
        changed = normalizeProduct({ ...p, ...action.patch, sku: p.sku, isPackage: p.isPackage });
        return changed;
      });
      if (!changed) return state;
      const categories = state.categories.some((c) => c.name === changed.category)
        ? state.categories
        : [...state.categories, { name: changed.category, isPackage: changed.isPackage }];
      return { ...state, products, categories };
    }

    case 'SET_OPTIONS':
      return { ...state, options: { ...state.options, ...action.patch } };

    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    default:
      return state;
  }
}
