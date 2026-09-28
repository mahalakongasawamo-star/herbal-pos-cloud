'use client';

// Live per-branch stock balances — its own realtime subscription (separate
// from CatalogProvider) because it changes far more often (every sale,
// every stock-in) than the catalog does. RLS already scopes what a session
// can see, so no explicit branch filter is needed here either.
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchStockBalances, indexStockBalances, onHand } from '@/lib/data/stock';
import type { StockBalance } from '@/lib/types';

export interface LiveStock {
  balances: StockBalance[];
  /** on-hand qty for (branchId, productId), 0 if no row. */
  onHand: (branchId: string, productId: string) => number;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useLiveStock(): LiveStock {
  const supabase = useMemo(() => createClient(), []);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useMemo(
    () => async () => {
      const rows = await fetchStockBalances(supabase);
      setBalances(rows);
      setLoading(false);
    },
    [supabase],
  );

  useEffect(() => {
    // refetch's setState happens after an await, not synchronously here —
    // see CatalogProvider for the same pattern and the same false positive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
    const channel = supabase
      .channel('stock-balance-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_balances' }, () => void refetch())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, refetch]);

  const index = useMemo(() => indexStockBalances(balances), [balances]);
  return { balances, onHand: (branchId, productId) => onHand(index, branchId, productId), loading, refetch };
}
