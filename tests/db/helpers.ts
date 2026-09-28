// Shared harness for database tests. Talks straight to the local Supabase
// Postgres (not through PostgREST) so a test can play any user by setting the
// same JWT claims PostgREST would, and can hold transactions open to force
// real lock contention between connections.
import pg from 'pg';

export const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Seed users (supabase/seed.sql).
export const USERS = {
  owner: '00000000-0000-4000-8000-000000000001',
  manager: '00000000-0000-4000-8000-000000000002',
  cashierMnla: '00000000-0000-4000-8000-000000000003',
  cashierBaguio: '00000000-0000-4000-8000-000000000004',
} as const;

export const pool = new pg.Pool({ connectionString: DB_URL, max: 40 });

/** A dedicated connection whose transaction runs as `uid` under RLS. */
export class Session {
  private constructor(readonly client: pg.PoolClient, readonly uid: string | null) {}

  static async open(uid: string | null): Promise<Session> {
    const client = await pool.connect();
    return new Session(client, uid);
  }

  /** BEGIN, then become `authenticated` (or `anon` when uid is null) with the user's claims. */
  async begin(): Promise<void> {
    await this.client.query('begin');
    await this.client.query(`select set_config('role', $1, true)`, [this.uid ? 'authenticated' : 'anon']);
    await this.client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(this.uid ? { sub: this.uid, role: 'authenticated' } : { role: 'anon' }),
    ]);
  }

  query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]) {
    return this.client.query<T>(sql, params);
  }

  async commit(): Promise<void> {
    await this.client.query('commit');
  }

  async rollback(): Promise<void> {
    await this.client.query('rollback');
  }

  async pid(): Promise<number> {
    const r = await this.client.query<{ pid: number }>('select pg_backend_pid() as pid');
    return r.rows[0].pid;
  }

  release(): void {
    this.client.release();
  }
}

/** Run `fn` as `uid` in its own transaction; commit on success, roll back on error. */
export async function asUser<T>(uid: string | null, fn: (s: Session) => Promise<T>, opts: { commit?: boolean } = {}): Promise<T> {
  const s = await Session.open(uid);
  try {
    await s.begin();
    const out = await fn(s);
    if (opts.commit) await s.commit();
    else await s.rollback();
    return out;
  } catch (e) {
    await s.rollback().catch(() => {});
    throw e;
  } finally {
    s.release();
  }
}

/** Superuser query (bypasses RLS) — for fixtures and assertions only. */
export async function admin<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]) {
  return pool.query<T>(sql, params);
}

export async function ids() {
  const branches = await admin<{ id: string; code: string }>('select id, code from public.branches');
  const products = await admin<{ id: string; sku: string }>('select id, sku from public.products');
  const methods = await admin<{ id: string; name: string }>('select id, name from public.payment_methods');
  const b = Object.fromEntries(branches.rows.map((r) => [r.code, r.id]));
  const p = Object.fromEntries(products.rows.map((r) => [r.sku, r.id]));
  const m = Object.fromEntries(methods.rows.map((r) => [r.name, r.id]));
  return { branch: b, product: p, method: m };
}

export async function balance(branchId: string, productId: string): Promise<number> {
  const r = await admin<{ qty: number }>(
    'select qty from public.stock_balances where branch_id = $1 and product_id = $2',
    [branchId, productId],
  );
  return r.rows[0]?.qty ?? 0;
}

/** Receive stock as the owner (committed) so every connection can see it. */
export async function receive(branchId: string, entries: { product_id: string; qty: number }[], note = 'test') {
  return asUser(
    USERS.owner,
    (s) => s.query('select * from public.receive_stock($1, $2::jsonb[], $3::jsonb[], null, $4)', [
      branchId,
      entries.map((e) => JSON.stringify(e)),
      [],
      note,
    ]),
    { commit: true },
  );
}

/** Block until backend `pid` is waiting on a lock (proves real contention). */
export async function waitUntilBlocked(pid: number, timeoutMs = 10_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const r = await admin<{ wait_event_type: string | null }>(
      'select wait_event_type from pg_stat_activity where pid = $1',
      [pid],
    );
    if (r.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error(`backend ${pid} never blocked on a lock`);
}

export type PgError = Error & { code?: string; hint?: string; detail?: string };

/** Run a promise and capture either its value or the Postgres error. */
export async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: PgError }> {
  try {
    return { ok: true, value: await p };
  } catch (error) {
    return { ok: false, error: error as PgError };
  }
}

export function salePayload(o: {
  clientRef: string;
  lines: { product_id: string; qty: number }[];
  paymentMethodId: string;
  expectedTotal?: number;
  tendered?: number;
  branchId?: string;
  customer?: string;
}) {
  return {
    client_ref: o.clientRef,
    branch_id: o.branchId,
    customer_name: o.customer ?? 'Test Customer',
    customer_tier: 'New',
    payment_method_id: o.paymentMethodId,
    tendered: o.tendered ?? 0,
    expected_total: o.expectedTotal ?? 0,
    lines: o.lines,
  };
}
