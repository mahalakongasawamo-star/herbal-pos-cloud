// Reporting periods: Daily, Weekly (Mon–Sun), Monthly, Yearly — all local time.

export const PERIODS = ['Daily', 'Weekly', 'Monthly', 'Yearly'];

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function rangeFor(period, anchor) {
  const a = new Date(anchor);
  if (period === 'Daily') {
    const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    return { start, end: addDays(start, 1) };
  }
  if (period === 'Weekly') {
    const back = (a.getDay() + 6) % 7; // Monday = 0
    const start = new Date(a.getFullYear(), a.getMonth(), a.getDate() - back);
    return { start, end: addDays(start, 7) };
  }
  if (period === 'Monthly') {
    return { start: new Date(a.getFullYear(), a.getMonth(), 1), end: new Date(a.getFullYear(), a.getMonth() + 1, 1) };
  }
  return { start: new Date(a.getFullYear(), 0, 1), end: new Date(a.getFullYear() + 1, 0, 1) };
}

export function shiftAnchor(period, anchor, dir) {
  const a = new Date(anchor);
  if (period === 'Daily') return addDays(a, dir);
  if (period === 'Weekly') return addDays(a, 7 * dir);
  if (period === 'Monthly') return new Date(a.getFullYear(), a.getMonth() + dir, 1);
  return new Date(a.getFullYear() + dir, 0, 1);
}

export function rangeLabel(period, { start, end }) {
  if (period === 'Daily') {
    return start.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  if (period === 'Weekly') {
    const last = addDays(end, -1);
    const sameYear = start.getFullYear() === last.getFullYear();
    const a = start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
    const b = last.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${a} – ${b}`;
  }
  if (period === 'Monthly') return start.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  return String(start.getFullYear());
}

/** Buckets for the sales trend chart. */
export function bucketsFor(period, { start, end }) {
  if (period === 'Daily') {
    const h = (i) => `${i % 12 || 12} ${i < 12 ? 'AM' : 'PM'}`;
    return { count: 24, indexOf: (d) => d.getHours(), label: (i) => (i % 3 === 0 ? h(i) : ''), title: h };
  }
  if (period === 'Weekly') {
    return {
      count: 7,
      indexOf: (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 864e5),
      label: (i) => addDays(start, i).toLocaleDateString('en-PH', { weekday: 'short' }),
      title: (i) => addDays(start, i).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' }),
    };
  }
  if (period === 'Monthly') {
    const count = Math.round((end - start) / 864e5);
    return {
      count,
      indexOf: (d) => d.getDate() - 1,
      label: (i) => (i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : ''),
      title: (i) => addDays(start, i).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }),
    };
  }
  return {
    count: 12,
    indexOf: (d) => d.getMonth(),
    label: (i) => new Date(2000, i, 1).toLocaleDateString('en-PH', { month: 'short' }),
    title: (i) => new Date(start.getFullYear(), i, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
  };
}
