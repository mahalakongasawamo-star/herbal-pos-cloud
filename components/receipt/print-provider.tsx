'use client';

// Replaces the print/receipt-viewer orchestration that legacy-vite-app's
// App.jsx held at the top level (printJob/receiptView state, the hidden
// #print-root portal, and the double-rAF tryPrint() effect) — split there
// across App.jsx + PrintCenter.jsx; consolidated here into one provider so
// any screen can call printSale()/viewReceipt() the same way POS and Sales
// log did via useApp().
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { tryPrint } from '@/lib/platform';
import { useCatalog } from '@/components/providers/catalog-provider';
import { ReceiptSheet } from '@/components/receipt/receipt';
import { ReceiptModal } from '@/components/receipt/receipt-modal';
import type { Sale } from '@/lib/types';

interface ReceiptView {
  sale: Sale;
  /** Set when the last print attempt for this receipt probably didn't open
   * a dialog (tryPrint()'s heuristic) — shows the download-fallback banner. */
  notice?: 'blocked';
}

interface PrintState {
  /** Prints straight away (POS, right after a save). */
  printSale: (sale: Sale) => void;
  /** Opens the receipt viewer/print/void modal. `sale` must already have
   * its `items` loaded (fetchSaleWithItems) — this never fetches on its
   * own, so callers with only a summary row (Sales log's list) fetch the
   * full sale first. */
  viewReceipt: (sale: Sale) => void;
}

const PrintCtx = createContext<PrintState | null>(null);

export function usePrint(): PrintState {
  const ctx = useContext(PrintCtx);
  if (!ctx) throw new Error('usePrint() must be used inside <PrintProvider>');
  return ctx;
}

export function PrintProvider({ children }: { children: ReactNode }) {
  const [printJob, setPrintJob] = useState<{ sale: Sale; n: number } | null>(null);
  const [receiptView, setReceiptView] = useState<ReceiptView | null>(null);

  const printSale = useCallback((sale: Sale) => setPrintJob({ sale, n: Date.now() }), []);
  const viewReceipt = useCallback((sale: Sale) => setReceiptView({ sale }), []);

  useEffect(() => {
    if (!printJob) return undefined;
    let cancelled = false;
    // Two rAFs: let the portal-rendered #print-root actually paint (one
    // frame for React to commit, one for the browser to lay it out) before
    // asking the OS for a print dialog — matching legacy's timing exactly.
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        void (async () => {
          const ok = await tryPrint();
          if (!ok && !cancelled) setReceiptView({ sale: printJob.sale, notice: 'blocked' });
        })();
      });
      return () => cancelAnimationFrame(raf2);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [printJob]);

  return (
    <PrintCtx.Provider value={{ printSale, viewReceipt }}>
      {children}
      <PrintRoot job={printJob} />
      {receiptView && (
        <ReceiptModal
          view={receiptView}
          onPrint={printSale}
          onClose={() => setReceiptView(null)}
          onVoided={(voided) => setReceiptView((v) => (v ? { ...v, sale: voided } : v))}
        />
      )}
    </PrintCtx.Provider>
  );
}

/** Hidden on screen; the only thing visible when printing. */
function PrintRoot({ job }: { job: { sale: Sale; n: number } | null }) {
  const { settings } = useCatalog();
  if (!job || typeof document === 'undefined') return null;
  return createPortal(
    <div id="print-root" aria-hidden="true">
      <ReceiptSheet sale={job.sale} settings={settings} layout={settings.printLayout} />
    </div>,
    document.body,
  );
}
