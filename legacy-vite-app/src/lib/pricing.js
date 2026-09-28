import { round2, pct } from './format';

export function indexProducts(products) {
  const m = {};
  for (const p of products) m[p.sku] = p;
  return m;
}

/**
 * Member pricing, in order of precedence:
 *   1. a tier-specific price set on the product (Product master > Tier prices)
 *   2. the product's member price
 *   3. retail price less the member tier's discount % (Options > Member tiers)
 * New customers always pay the retail price.
 */
export function resolveUnitPrice(product, ctx) {
  const retail = Math.max(0, Number(product?.price) || 0);
  const { customerTier, memberTier, tiers } = ctx || {};
  if (customerTier !== 'Member' || !memberTier) return { retail, unit: retail, rule: 'Retail price' };
  const tierPrice = Number(product?.tierPrices?.[memberTier]);
  if (tierPrice > 0) return { retail, unit: tierPrice, rule: `${memberTier} price` };
  const memberPrice = Number(product?.memberPrice);
  if (memberPrice > 0) return { retail, unit: memberPrice, rule: 'Member price' };
  const tier = (tiers || []).find((t) => t.name === memberTier);
  const off = Math.min(100, Math.max(0, Number(tier?.discountPct) || 0));
  if (off > 0 && retail > 0) return { retail, unit: round2(retail * (1 - off / 100)), rule: `${memberTier} ${pct(off)} off` };
  return { retail, unit: retail, rule: 'Retail price' };
}

/**
 * Line math. Unit price is the retail price (or the charged price when a
 * member price is set above retail), subtotal = unit × qty, discount =
 * subtotal − what the customer actually pays.
 */
export function computeCart(lines, bySku, ctx) {
  let gross = 0;
  let discount = 0;
  let total = 0;
  let units = 0;
  const out = lines.map((line, index) => {
    const p = bySku[line.sku];
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    const { retail, unit, rule } = resolveUnitPrice(p, ctx);
    const base = Math.max(retail, unit);
    const lineGross = round2(base * qty);
    const lineNet = round2(unit * qty);
    const lineDiscount = round2(lineGross - lineNet);
    gross += lineGross;
    discount += lineDiscount;
    total += lineNet;
    units += qty;
    return {
      index,
      sku: line.sku,
      qty,
      name: p?.name || line.sku,
      category: p?.category || '',
      isPackage: !!p?.isPackage,
      unavailable: !p || p.active === false,
      unitPrice: base,
      chargedUnit: unit,
      gross: lineGross,
      discount: lineDiscount,
      net: lineNet,
      rule,
    };
  });
  return { lines: out, gross: round2(gross), discount: round2(discount), total: round2(total), units };
}

/** Physical stock a set of lines needs, with packages expanded into their contents. */
export function componentDemand(lines, bySku) {
  const need = {};
  for (const l of lines) {
    const p = bySku[l.sku];
    const q = Math.max(0, Math.floor(Number(l.qty) || 0));
    if (!p || !q) continue;
    if (p.isPackage) {
      for (const inc of p.inclusions || []) need[inc.sku] = (need[inc.sku] || 0) + inc.qty * q;
    } else {
      need[p.sku] = (need[p.sku] || 0) + q;
    }
  }
  return need;
}

export const onHand = (row) => (Number(row?.added) || 0) - (Number(row?.sold) || 0);

export function shortfalls(need, stock) {
  return Object.entries(need)
    .filter(([sku, q]) => onHand(stock[sku]) < q)
    .map(([sku, q]) => ({ sku, need: q, have: Math.max(0, onHand(stock[sku])) }));
}

/** In stock: above reorder level. Low: 1..reorder level. Out: 0. */
export function stockStatus(current, reorderLevel) {
  if (current <= 0) return 'out';
  if (current <= (Number(reorderLevel) || 0)) return 'low';
  return 'in';
}

/** How many of a package can still be sold given what's available. */
export function packageCapacity(pkg, available) {
  const inc = pkg.inclusions || [];
  if (!inc.length) return Infinity;
  return Math.max(0, Math.min(...inc.map((i) => Math.floor((available[i.sku] ?? 0) / i.qty))));
}
