// The highest-risk property of the whole migration (SPEC §6, §7, DoD §14):
// simultaneous callers must never oversell stock, never share a receipt
// number, and never double-apply a sale, void or reversal.
//
// Each "deterministic" test holds one transaction open, proves the second
// connection is genuinely blocked on a lock (pg_stat_activity), then releases
// the first — so the race is forced, not left to timing luck.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USERS, Session, admin, balance, ids, pool, receive, salePayload, settle, waitUntilBlocked } from './helpers';

let I: Awaited<ReturnType<typeof ids>>;
let today: string;

beforeAll(async () => {
  I = await ids();
  today = (await admin<{ d: string }>(`select to_char(now() at time zone 'Asia/Manila', 'YYYYMMDD') as d`)).rows[0].d;
});

afterAll(async () => {
  await pool.end();
});

const sell = (s: Session, payload: object) =>
  s.query<{ id: string; receipt_no: string; status: string }>('select * from public.commit_sale($1)', [payload]);

const cash = () => I.method['Cash'];
const seqOf = (receipt: string) => Number(receipt.split('-')[2]);

describe('commit_sale under concurrency', () => {
  it('a burst of simultaneous sales on the same stock never oversells and never repeats a receipt number', async () => {
    // BAGUIO first: on a freshly reset DB this is also the first sale of the
    // day there, so the burst races on creating the receipt-counter row.
    const baguio = I.branch.BAGUIO;
    const tib = I.product['HD-TIB'];
    const mgrPkg = I.product['PKG-MGR']; // 14 × HD-TIB
    await receive(baguio, [{ product_id: tib, qty: 30 }]);
    const start = await balance(baguio, tib);

    // 12 tills at once: 3 Manager Packages (42 units) + 9 singles (9 units)
    // > what's on the shelf, so some must be refused.
    const orders = [
      ...Array.from({ length: 3 }, () => ({ product_id: mgrPkg, qty: 1, units: 14 })),
      ...Array.from({ length: 9 }, () => ({ product_id: tib, qty: 1, units: 1 })),
    ];
    const sessions = await Promise.all(
      orders.map((_, i) => Session.open(i % 2 ? USERS.cashierBaguio : USERS.manager)),
    );
    await Promise.all(sessions.map((s) => s.begin()));

    const results = await Promise.all(
      orders.map(async (o, i) => {
        const s = sessions[i];
        const r = await settle(
          sell(s, salePayload({
            clientRef: randomUUID(),
            branchId: baguio,
            paymentMethodId: cash(),
            lines: [{ product_id: o.product_id, qty: o.qty }],
          })),
        );
        if (r.ok) await s.commit();
        else await s.rollback();
        s.release();
        return { ...o, r };
      }),
    );

    const won = results.filter((x) => x.r.ok);
    const lost = results.filter((x) => !x.r.ok);
    for (const l of lost) expect(!l.r.ok && l.r.error.hint).toBe('insufficient_stock');

    const sold = won.reduce((n, w) => n + w.units, 0);
    expect(sold).toBeLessThanOrEqual(start);
    expect(await balance(baguio, tib)).toBe(start - sold);

    const receipts = won.map((w) => (w.r.ok ? w.r.value.rows[0].receipt_no : ''));
    expect(new Set(receipts).size).toBe(receipts.length);
    for (const rn of receipts) expect(rn).toMatch(new RegExp(`^BAGUIO-${today}-\\d{4}$`));
    // Refused sales roll their counter increment back: the numbers are contiguous.
    const seqs = receipts.map(seqOf).sort((a, b) => a - b);
    expect(seqs[seqs.length - 1] - seqs[0]).toBe(seqs.length - 1);
  });

  it('a second sale for the last units waits for the first, then is refused', async () => {
    const mnla = I.branch.MNLA;
    const p = I.product['OC-INS'];
    await receive(mnla, [{ product_id: p, qty: 5 }]);
    const start = await balance(mnla, p);
    const need = Math.floor(start / 2) + 1; // two of these can never both fit

    const a = await Session.open(USERS.cashierMnla);
    const b = await Session.open(USERS.manager);
    try {
      await a.begin();
      await b.begin();
      const ra = await sell(a, salePayload({ clientRef: randomUUID(), paymentMethodId: cash(), lines: [{ product_id: p, qty: need }] }));
      const bPid = await b.pid();
      const pending = settle(sell(b, salePayload({ clientRef: randomUUID(), branchId: mnla, paymentMethodId: cash(), lines: [{ product_id: p, qty: need }] })));
      await waitUntilBlocked(bPid);
      await a.commit();
      const rb = await pending;
      expect(rb.ok).toBe(false);
      if (!rb.ok) expect(rb.error.hint).toBe('insufficient_stock');
      await b.rollback();
      expect(ra.rows[0].receipt_no).toMatch(new RegExp(`^MNLA-${today}-\\d{4}$`));
      expect(await balance(mnla, p)).toBe(start - need);
    } finally {
      a.release();
      b.release();
    }
  });

  it('two sales at the same branch get consecutive numbers even when the first is held open', async () => {
    const mnla = I.branch.MNLA;
    const p = I.product['OC-MAH'];
    await receive(mnla, [{ product_id: p, qty: 10 }]);
    const a = await Session.open(USERS.cashierMnla);
    const b = await Session.open(USERS.cashierMnla);
    try {
      await a.begin();
      await b.begin();
      const ra = await sell(a, salePayload({ clientRef: randomUUID(), paymentMethodId: cash(), lines: [{ product_id: p, qty: 1 }] }));
      const bPid = await b.pid();
      const pending = sell(b, salePayload({ clientRef: randomUUID(), paymentMethodId: cash(), lines: [{ product_id: p, qty: 1 }] }));
      await waitUntilBlocked(bPid);
      await a.commit();
      const rb = await pending;
      await b.commit();
      expect(seqOf(rb.rows[0].receipt_no)).toBe(seqOf(ra.rows[0].receipt_no) + 1);
    } finally {
      a.release();
      b.release();
    }
  });

  it("one branch's open sale doesn't block the other branch", async () => {
    const mnla = I.branch.MNLA;
    const baguio = I.branch.BAGUIO;
    const p = I.product['OC-CC'];
    await receive(mnla, [{ product_id: p, qty: 3 }]);
    await receive(baguio, [{ product_id: p, qty: 3 }]);
    const a = await Session.open(USERS.cashierMnla);
    const b = await Session.open(USERS.cashierBaguio);
    try {
      await a.begin();
      await b.begin();
      await sell(a, salePayload({ clientRef: randomUUID(), paymentMethodId: cash(), lines: [{ product_id: p, qty: 1 }] }));
      // A still holds MNLA's locks; BAGUIO must finish anyway.
      const rb = await Promise.race([
        sell(b, salePayload({ clientRef: randomUUID(), paymentMethodId: cash(), lines: [{ product_id: p, qty: 1 }] })),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('BAGUIO sale blocked behind MNLA')), 5000)),
      ]);
      expect(rb.rows[0].receipt_no.startsWith(`BAGUIO-${today}-`)).toBe(true);
      await b.commit();
      await a.commit();
    } finally {
      a.release();
      b.release();
    }
  });

  it('a retried ticket (same client_ref) is saved once, even when both attempts race', async () => {
    const mnla = I.branch.MNLA;
    const p = I.product['OC-RCC'];
    await receive(mnla, [{ product_id: p, qty: 4 }]);
    const start = await balance(mnla, p);
    const ref = randomUUID();
    const payload = salePayload({ clientRef: ref, paymentMethodId: cash(), lines: [{ product_id: p, qty: 2 }] });

    const a = await Session.open(USERS.cashierMnla);
    const b = await Session.open(USERS.cashierMnla);
    try {
      await a.begin();
      await b.begin();
      const ra = await sell(a, payload);
      const bPid = await b.pid();
      const pending = sell(b, payload);
      await waitUntilBlocked(bPid);
      await a.commit();
      const rb = await pending;
      await b.commit();
      expect(rb.rows[0].id).toBe(ra.rows[0].id);
      expect(rb.rows[0].receipt_no).toBe(ra.rows[0].receipt_no);
    } finally {
      a.release();
      b.release();
    }
    const count = await admin<{ n: string }>('select count(*) as n from public.sales where client_ref = $1', [ref]);
    expect(Number(count.rows[0].n)).toBe(1);
    expect(await balance(mnla, p)).toBe(start - 2);

    // Someone else can't claim that ticket.
    const other = await Session.open(USERS.manager);
    try {
      await other.begin();
      const r = await settle(sell(other, { ...payload, branch_id: mnla }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.hint).toBe('forbidden');
      await other.rollback();
    } finally {
      other.release();
    }
  });
});

describe('void_sale and reverse_stock_in under concurrency', () => {
  it('two simultaneous voids of one sale restock it exactly once', async () => {
    const mnla = I.branch.MNLA;
    const p = I.product['OC-KRM'];
    await receive(mnla, [{ product_id: p, qty: 6 }]);
    const before = await balance(mnla, p);
    const seller = await Session.open(USERS.cashierMnla);
    await seller.begin();
    const sale = (await sell(seller, salePayload({ clientRef: randomUUID(), paymentMethodId: cash(), lines: [{ product_id: p, qty: 4 }] }))).rows[0];
    await seller.commit();
    seller.release();
    expect(await balance(mnla, p)).toBe(before - 4);

    const a = await Session.open(USERS.cashierMnla);
    const b = await Session.open(USERS.owner);
    try {
      await a.begin();
      await b.begin();
      await a.query('select * from public.void_sale($1, $2)', [sale.id, 'customer changed mind']);
      const bPid = await b.pid();
      const pending = settle(b.query('select * from public.void_sale($1, $2)', [sale.id, 'duplicate']));
      await waitUntilBlocked(bPid);
      await a.commit();
      const rb = await pending;
      expect(rb.ok).toBe(false);
      if (!rb.ok) expect(rb.error.hint).toBe('already_void');
      await b.rollback();
    } finally {
      a.release();
      b.release();
    }
    expect(await balance(mnla, p)).toBe(before);
  });

  it('a sale that uses up received stock blocks a reversal of that stock-in (and vice versa)', async () => {
    const mnla = I.branch.MNLA;
    const p = I.product['OC-KRT'];

    // Sale first -> reversal refused.
    const si1 = (await receive(mnla, [{ product_id: p, qty: 3 }])).rows[0] as { id: string };
    const onHand1 = await balance(mnla, p);
    const a = await Session.open(USERS.cashierMnla);
    const b = await Session.open(USERS.owner);
    try {
      await a.begin();
      await b.begin();
      await sell(a, salePayload({ clientRef: randomUUID(), paymentMethodId: cash(), lines: [{ product_id: p, qty: onHand1 }] }));
      const bPid = await b.pid();
      const pending = settle(b.query('select public.reverse_stock_in($1)', [si1.id]));
      await waitUntilBlocked(bPid);
      await a.commit();
      const rb = await pending;
      expect(rb.ok).toBe(false);
      if (!rb.ok) expect(rb.error.hint).toBe('would_go_negative');
      await b.rollback();
    } finally {
      a.release();
      b.release();
    }
    expect(await balance(mnla, p)).toBe(0);
    const reversed = await admin<{ reversed: boolean }>('select reversed from public.stock_ins where id = $1', [si1.id]);
    expect(reversed.rows[0].reversed).toBe(false);

    // Reversal first -> the sale that needed that stock is refused.
    const si2 = (await receive(mnla, [{ product_id: p, qty: 3 }])).rows[0] as { id: string };
    const c = await Session.open(USERS.owner);
    const d = await Session.open(USERS.cashierMnla);
    try {
      await c.begin();
      await d.begin();
      await c.query('select public.reverse_stock_in($1)', [si2.id]);
      const dPid = await d.pid();
      const pending = settle(sell(d, salePayload({ clientRef: randomUUID(), paymentMethodId: cash(), lines: [{ product_id: p, qty: 3 }] })));
      await waitUntilBlocked(dPid);
      await c.commit();
      const rd = await pending;
      expect(rd.ok).toBe(false);
      if (!rd.ok) expect(rd.error.hint).toBe('insufficient_stock');
      await d.rollback();
    } finally {
      c.release();
      d.release();
    }
    expect(await balance(mnla, p)).toBe(0);
  });

  it('two simultaneous reversals of one stock-in apply once', async () => {
    const mnla = I.branch.MNLA;
    const p = I.product['OP-TUR'];
    const before = await balance(mnla, p);
    const si = (await receive(mnla, [{ product_id: p, qty: 7 }])).rows[0] as { id: string };
    const a = await Session.open(USERS.owner);
    const b = await Session.open(USERS.manager);
    try {
      await a.begin();
      await b.begin();
      await a.query('select public.reverse_stock_in($1)', [si.id]);
      const bPid = await b.pid();
      const pending = settle(b.query('select public.reverse_stock_in($1)', [si.id]));
      await waitUntilBlocked(bPid);
      await a.commit();
      const rb = await pending;
      expect(rb.ok).toBe(false);
      if (!rb.ok) expect(rb.error.hint).toBe('already_reversed');
      await b.rollback();
    } finally {
      a.release();
      b.release();
    }
    expect(await balance(mnla, p)).toBe(before);
  });
});

describe('ledger integrity after all of the above', () => {
  it('stock_balances still equals the sum of the ledger everywhere, and nothing is negative', async () => {
    const drift = await admin('select * from private.stock_drift()');
    expect(drift.rows).toEqual([]);
    const neg = await admin('select * from public.stock_balances where qty < 0');
    expect(neg.rows).toEqual([]);
    const dupes = await admin('select receipt_no from public.sales group by receipt_no having count(*) > 1');
    expect(dupes.rows).toEqual([]);
  });
});
