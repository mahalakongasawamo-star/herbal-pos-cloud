'use client';

// Ported from legacy-vite-app/src/components/PrintCenter.jsx's ReceiptModal
// — view/print/download/void a receipt. `dispatch({type:'VOID_SALE',...})`
// becomes a direct call to the void_sale RPC.
import { useRef, useState } from 'react';
import { Ban, Download, Printer, TriangleAlert } from 'lucide-react';
import { Button, Modal, Segmented, useConfirm, useToast } from '@/components/ui';
import { fmtDateTime, peso } from '@/lib/format';
import { saveFile } from '@/lib/platform';
import { createClient } from '@/lib/supabase/client';
import { voidSale as voidSaleRpc } from '@/lib/rpc/void-sale';
import { RpcError } from '@/lib/rpc/errors';
import { updateSettings } from '@/lib/data/settings';
import { useCatalog } from '@/components/providers/catalog-provider';
import { ReceiptSheet, receiptDocument, type PrintLayout } from '@/components/receipt/receipt';
import type { Sale } from '@/lib/types';

export const LAYOUT_OPTIONS: { value: PrintLayout; label: string }[] = [
  { value: 'stacked', label: 'Top and bottom' },
  { value: 'side', label: 'Side by side' },
];

export function ReceiptModal({
  view,
  onClose,
  onPrint,
  onVoided,
}: {
  view: { sale: Sale; notice?: 'blocked' };
  onClose: () => void;
  onPrint: (sale: Sale) => void;
  onVoided: (sale: Sale) => void;
}) {
  const { settings, refetch } = useCatalog();
  const toast = useToast();
  const confirm = useConfirm();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const sale = view.sale;

  const download = async () => {
    const doc = receiptDocument(sheetRef.current, `Receipt ${sale.receiptNo}`);
    const r = await saveFile(`receipt-${sale.receiptNo}.html`, doc, 'text/html');
    if (r.ok) toast({ title: 'Receipt saved', message: 'Open the file in your browser; it opens the print dialog by itself.' });
    else if (!r.declined) toast({ tone: 'bad', title: 'Receipt not saved', message: r.message });
  };

  const doVoid = async () => {
    const reason = await confirm({
      title: `Void receipt ${sale.receiptNo}?`,
      message: 'Voiding returns every item on this sale to stock and removes it from reports. The receipt stays in the sales log, marked void.',
      confirmLabel: 'Void sale',
      tone: 'danger',
      input: { label: 'Reason', placeholder: 'For example: wrong item rung up', required: true },
    });
    if (!reason) return;
    setBusy(true);
    try {
      const voided = await voidSaleRpc(createClient(), sale.id, reason);
      onVoided({ ...voided, items: sale.items });
      toast({ title: 'Sale voided', message: 'The items were returned to stock.' });
    } catch (err) {
      toast({ tone: 'bad', title: 'Could not void the sale', message: err instanceof RpcError ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  const setPrintLayout = async (v: PrintLayout) => {
    try {
      await updateSettings(createClient(), { printLayout: v });
      await refetch();
    } catch {
      toast({ tone: 'bad', title: 'Could not change the layout' });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Receipt ${sale.receiptNo}`}
      description={`${fmtDateTime(sale.createdAt)} at ${sale.cashierName ?? ''}, ${peso(sale.totalDue)}`}
      footer={
        <>
          {sale.status !== 'void' && (
            <Button variant="dangerGhost" icon={Ban} onClick={doVoid} disabled={busy} className="mr-auto">
              Void sale
            </Button>
          )}
          <Button icon={Download} onClick={download} disabled={busy}>
            Download receipt
          </Button>
          <Button variant="primary" icon={Printer} onClick={() => onPrint(sale)} disabled={busy}>
            Print 2 copies
          </Button>
        </>
      }
    >
      {view.notice === 'blocked' && (
        <div className="mb-4 flex gap-3 rounded-xl border border-warn/40 bg-warn-soft p-3 text-sm text-ink">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
          <p>
            The browser didn’t open the print dialog in this view. Download the receipt and open it (it prints itself), or run the
            POS in its own browser tab where printing works directly.
          </p>
        </div>
      )}
      {sale.status === 'void' && (
        <div className="mb-4 rounded-xl border border-bad/40 bg-bad-soft p-3 text-sm text-ink">
          <strong className="text-bad">Void.</strong> {sale.voidedAt ? fmtDateTime(sale.voidedAt) : ''}
          {sale.voidReason ? ` — ${sale.voidReason}` : ''}. Items were returned to stock.
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">A4 portrait, customer copy and cashier copy on one sheet.</p>
        <Segmented size="sm" ariaLabel="Print layout" value={settings.printLayout} onChange={setPrintLayout} options={LAYOUT_OPTIONS} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white p-4 shadow-inner sm:p-6">
        <div className="mx-auto min-w-[640px] max-w-[794px]">
          <ReceiptSheet ref={sheetRef} sale={sale} settings={settings} layout={settings.printLayout} />
        </div>
      </div>
    </Modal>
  );
}
