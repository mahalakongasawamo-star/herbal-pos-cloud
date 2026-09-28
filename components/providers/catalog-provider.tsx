'use client';

// Reference data every screen needs — categories, products (with package
// contents resolved), member tiers, payment methods, branches, store
// settings. Loaded once per session and kept live via Realtime, the same
// role legacy's single in-memory `data` object played, just backed by
// Postgres instead of IndexedDB. Per-branch stock and sales are NOT here —
// those are large/growing and belong to the screens that actually need
// them (see lib/data/stock.ts, lib/data/sales.ts), each with their own
// realtime subscription.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchCatalog, type Catalog } from '@/lib/data/catalog';
import { fetchBranches } from '@/lib/data/branches';
import { fetchSettings } from '@/lib/data/settings';
import type { Branch, Settings } from '@/lib/types';

interface CatalogState extends Catalog {
  branches: Branch[];
  settings: Settings;
  loading: boolean;
  error: string | null;
  /** Re-reads everything from the server — call after a write the realtime
   * subscription might not (or might not yet) reflect, e.g. right after an
   * owner edit this same client just made. */
  refetch: () => Promise<void>;
}

const EMPTY_SETTINGS: Settings = {
  companyName: '',
  companyDetails: '',
  receiptTitle: 'Sales receipt',
  receiptFooter: '',
  logo: '',
  printLayout: 'stacked',
  optionsReviewed: false,
  updatedAt: '',
};

const CatalogCtx = createContext<CatalogState | null>(null);

export function useCatalog(): CatalogState {
  const ctx = useContext(CatalogCtx);
  if (!ctx) throw new Error('useCatalog() must be used inside <CatalogProvider>');
  return ctx;
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [catalog, setCatalog] = useState<Catalog>({ categories: [], products: [], memberTiers: [], paymentMethods: [] });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const [c, b, s] = await Promise.all([fetchCatalog(supabase), fetchBranches(supabase), fetchSettings(supabase)]);
      setCatalog(c);
      setBranches(b);
      setSettings(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    // refetch's setState calls happen after an await, not synchronously
    // during this effect; the rule can't see through the function
    // reference. This is the standard mount-time-fetch-plus-subscription
    // pattern, not the render-loop the rule exists to catch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
    // Any change to the catalog/options/settings tables — refetch the lot.
    // This data is small and slow-changing, so one broad channel is simpler
    // and cheap; screens with fast-moving data (stock, sales) use their own
    // narrower subscriptions instead.
    const channel = supabase
      .channel('catalog-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => void refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => void refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_inclusions' }, () => void refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_tiers' }, () => void refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_methods' }, () => void refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => void refetch())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, refetch]);

  const value: CatalogState = { ...catalog, branches, settings, loading, error, refetch };
  return <CatalogCtx.Provider value={value}>{children}</CatalogCtx.Provider>;
}
