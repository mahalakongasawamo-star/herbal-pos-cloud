import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Download, Printer, TriangleAlert } from 'lucide-react';
import { useApp } from '../lib/context';
import { saveFile } from '../lib/platform';
import { fmtDateTime, peso } from '../lib/format';
import { Button, Modal, Segmented, useConfirm, useToast } from './ui';
import { ReceiptSheet, receiptDocument } from './Receipt';

/** Hidden on screen; the only thing visible when printing. */
export function PrintRoot({ job, settings }) {
  if (!job) return null;
  return createPortal(
    <div id="print-root" aria-hidden="true">
      <ReceiptSheet sale={job.sale} settings={settings} layout={settings.printLayout} />
    </div>,
    document.body,
  );
}

export const LAYOUT_OPTIONS = [
  { value: 'stacked', label: 'Top and bottom' },
  { value: 'side', label: 'Side by side' },
];

export function ReceiptModal({ view, onClose }) {
  const { data, dispatch, printSale } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const sheetRef = useRef(null);
  const sale = view ? data.sales.find((s) => s.receiptNo === view.receiptNo) : null;
  if (!sale) return null;

  const download = async () => {
    const doc = receiptDocument(sheetRef.current, `Receipt ${sale.receiptNo}`);
    const r = await saveFile(`receipt-${sale.receiptNo}.html`, doc, 'text/html');
    if (r.ok) toast({ title: 'Receipt saved', message: 'Open the file in your browser; it opens the print dialog by itself.' });
    else if (!r.declined) toast({ tone: 'bad', title: 'Receipt not saved', message: r.message });
  };

  const voidSale = async () => {
    const reason = await confirm({
      title: `Void receipt ${sale.receiptNo}?`,
      message:
        'Voiding returns every item on this sale to stock and removes it from reports. The receipt stays in the sales log, marked void.',
      confirmLabel: 'Void sale',
      tone: 'danger',
      input: { label: 'Reason', placeholder: 'For example: wrong item rung up', required: true },
    });
    if (!reason) return;
    dispatch({ type: 'VOID_SALE', receiptNo: sale.receiptNo, reason });
    toast({ title: 'Sale voided', message: 'The items were returned to stock.' });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Receipt ${sale.receiptNo}`}
      description={`${fmtDateTime(sale.ts)} at ${sale.cashier}, ${peso(sale.totalDue)}`}
      footer={
        <>
          {sale.status !== 'void' && (
            <Button variant="dangerGhost" icon={Ban} onClick={voidSale} className="mr-auto">
              Void sale
            </Button>
          )}
          <Button icon={Download} onClick={download}>
            Download receipt
          </Button>
          <Button variant="primary" icon={Printer} onClick={() => printSale(sale)}>
            Print 2 copies
          </Button>
        </>
      }
    >
      {view.notice === 'blocked' && (
        <div className="mb-4 flex gap-3 rounded-xl border border-warn/40 bg-warn-soft p-3 text-sm text-ink">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
          <p>
            The browser didn’t open the print dialog in this view. Download the receipt and open it (it prints itself), or run
            the POS in its own browser tab where printing works directly.
          </p>
        </div>
      )}
      {sale.status === 'void' && (
        <div className="mb-4 rounded-xl border border-bad/40 bg-bad-soft p-3 text-sm text-ink">
          <strong className="text-bad">Void.</strong> {fmtDateTime(sale.voidedAt)}
          {sale.voidReason ? ` — ${sale.voidReason}` : ''}. Items were returned to stock.
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">A4 portrait, customer copy and cashier copy on one sheet.</p>
        <Segmented
          size="sm"
          ariaLabel="Print layout"
          value={data.settings.printLayout}
          onChange={(v) => dispatch({ type: 'SET_SETTINGS', patch: { printLayout: v } })}
          options={LAYOUT_OPTIONS}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white p-4 shadow-inner sm:p-6">
        <div className="mx-auto min-w-[640px] max-w-[794px]">
          <ReceiptSheet ref={sheetRef} sale={sale} settings={data.settings} layout={data.settings.printLayout} />
        </div>
      </div>
    </Modal>
  );
}
