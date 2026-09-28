// Every RPC (supabase/migrations/20260927140200_rpcs.sql) raises with a
// machine-readable HINT — not_staff, invalid, forbidden, insufficient_stock,
// price_mismatch, not_found, already_void, already_reversed,
// would_go_negative, already_saved — plus a human-readable message that's
// already safe to show as-is. This turns a thrown PostgrestError into that
// pair, with JSON `detail` (shortfall lists) parsed where present.
import type { PostgrestError } from '@supabase/supabase-js';

export type RpcHint =
  | 'not_staff'
  | 'invalid'
  | 'forbidden'
  | 'insufficient_stock'
  | 'price_mismatch'
  | 'not_found'
  | 'already_void'
  | 'already_reversed'
  | 'would_go_negative'
  | 'already_saved'
  | 'unknown';

export class RpcError extends Error {
  readonly hint: RpcHint;
  readonly detail: unknown;

  constructor(pgError: PostgrestError) {
    super(pgError.message);
    this.name = 'RpcError';
    this.hint = isRpcHint(pgError.hint) ? pgError.hint : 'unknown';
    this.detail = parseDetail(pgError.details);
  }
}

function isRpcHint(v: string | null | undefined): v is RpcHint {
  return (
    !!v &&
    [
      'not_staff',
      'invalid',
      'forbidden',
      'insufficient_stock',
      'price_mismatch',
      'not_found',
      'already_void',
      'already_reversed',
      'would_go_negative',
      'already_saved',
    ].includes(v)
  );
}

function parseDetail(details: string | null): unknown {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {
    return details;
  }
}

/** Shortfall entries from commit_sale's insufficient_stock detail. */
export interface StockShortfall {
  product_id: string;
  sku: string;
  name: string;
  need: number;
  have: number;
}

export function shortfalls(err: RpcError): StockShortfall[] {
  return err.hint === 'insufficient_stock' && Array.isArray(err.detail) ? (err.detail as StockShortfall[]) : [];
}

/** Wraps a Supabase RPC call so callers get RpcError, not a bare {data,error}. */
export async function callRpc<T>(promise: PromiseLike<{ data: T; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new RpcError(error);
  return data;
}
