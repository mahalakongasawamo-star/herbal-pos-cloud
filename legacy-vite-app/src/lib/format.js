// Formatting and small pure helpers shared across modules.

/** Round to centavos without binary drift (1.005 -> 1.01). */
export function round2(n) {
  const x = Number(n) || 0;
  const sign = x < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(x) * 100 + 1e-6)) / 100;
}

const moneyFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('en-PH');

/** 1234.5 -> "1,234.50" */
export const amount = (n) => moneyFmt.format(Math.abs(round2(n)));
/** 1234.5 -> "₱1,234.50", negatives -> "−₱1,234.50" */
export const peso = (n) => (round2(n) < 0 ? '−₱' : '₱') + amount(n);
export const int = (n) => intFmt.format(Math.round(Number(n) || 0));
export const pct = (n) => {
  const v = Number(n) || 0;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
};

/** Collapse whitespace and trim. */
export const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** Case-insensitive grouping key for names (leaders, uplines, customers). */
export const keyOf = (s) => norm(s).toLowerCase();
/** SKUs are uppercase, no spaces. */
export const cleanSku = (s) => norm(s).toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9\-_.]/g, '');

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const p2 = (n) => String(n).padStart(2, '0');

/** Receipt number format: YYYYMMDD-HHMMSS-XXXX (XXXX = running sequence). */
export function makeReceiptNo(d, seq) {
  const s = String((((Number(seq) || 0) % 10000) + 10000) % 10000).padStart(4, '0');
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}-${s}`;
}

export const fmtDateTime = (v) =>
  new Date(v).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
  });
export const fmtDateTimeShort = (v) =>
  new Date(v).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const fmtDate = (v) => new Date(v).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtLongDate = (v) =>
  new Date(v).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const fmtClock = (v) => new Date(v).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

/** Local calendar day as yyyy-mm-dd (for <input type="date">). */
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const parseDay = (s) => {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
};

/** Parse user-typed money ("1,250.50", "₱500") -> number or NaN. */
export function parseMoney(s) {
  if (s === '' || s == null) return NaN;
  const v = Number(String(s).replace(/[₱,\s]/g, ''));
  return Number.isFinite(v) ? v : NaN;
}

export function plural(n, one, many) {
  return `${int(n)} ${n === 1 ? one : many || one + 's'}`;
}
